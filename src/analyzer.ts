import * as vscode from 'vscode';
import { InteractionEvent } from './tracker';
import { ShortcutsLoader, Shortcut } from './shortcuts-loader';
import { LearnedShortcutsManager } from './learned-shortcuts-manager';

export interface AggregatedEvent {
    eventType: 'add' | 'delete';
    text: string;
    line: number;
    count: number;
    timestamp: number;
}

export class Analyzer {
    private lastRecommendationTime: number = 0;
    private cooldownInterval: number;
    private sessionRecommendationLimit: number;
    private shownShortcuts: Set<string> = new Set();

    // State for Text/Selection Analysis
    private recentEvents: AggregatedEvent[] = [];
    private currentEvent: AggregatedEvent | null = null;
    private readonly MAX_QUEUE_SIZE = 50;
    private readonly MAX_EVENT_TEXT_LENGTH = 100;

    private lastCtrlBackSpaceRecTime: number = 0;
    private lastCommentRecommendationTime: number = 0;

    private previousCursorPosition: { line: number; character: number } | null = null;
    private previousSelection: { isEmpty: boolean; start: { line: number; character: number }; end: { line: number; character: number } } | null = null;
    private hadSelection: boolean = false;
    private lastTextChangeTime: number = 0;

    constructor(
        private shortcutsLoader: ShortcutsLoader,
        private learnedShortcutsManager: LearnedShortcutsManager
    ) {
        const config = vscode.workspace.getConfiguration('shortcutsHelper');
        this.cooldownInterval = config.get<number>('cooldownInterval', 300000);
        this.sessionRecommendationLimit = config.get<number>('sessionRecommendationLimit', 3);
    }

    public async analyzeInteraction(event: InteractionEvent): Promise<void> {
        const now = Date.now();
        if (event.type !== 'tipOfTheDay' && Date.now() - this.lastRecommendationTime < this.cooldownInterval) {
            this.updateStateOnly(event);
            return;
        }
        const matchingShortcuts = this.shortcutsLoader.getShortcutsByType(event.type);
        if (matchingShortcuts.length === 0) {
            this.updateStateOnly(event);
            return;
        }
        const contextFilteredShortcuts = this.filterByContext(matchingShortcuts, event);
        if (contextFilteredShortcuts.length === 0) {
            this.updateStateOnly(event);
            return;
        }
        const unlearnedShortcuts = contextFilteredShortcuts.filter(
            shortcut => !this.learnedShortcutsManager.isLearned(shortcut.shortcut, shortcut.action)
        );
        if (unlearnedShortcuts.length === 0) {
            this.updateStateOnly(event);
            return;
        }

        const isSessionLimitReached = this.shownShortcuts.size >= this.sessionRecommendationLimit;
        let candidates = unlearnedShortcuts;
        if (isSessionLimitReached) { // only show the same shortcuts in this session if limit reached
            candidates = unlearnedShortcuts.filter(s => this.shownShortcuts.has(this.getShortcutKey(s)));
        }
        if (candidates.length === 0) {
            this.updateStateOnly(event);
            return;
        }
        const selectedShortcut = this.selectBestShortcut(candidates, event);
        this.lastRecommendationTime = now;
        this.shownShortcuts.add(this.getShortcutKey(selectedShortcut));
        await this.showRecommendation(selectedShortcut, event);
    }

    private updateStateOnly(event: InteractionEvent): void {
        // Helper to update state without returning shortcuts
        if (event.type === 'textChange') {
            this.filterTextChange([], event);
        } else if (event.type === 'selectionChange') {
            this.filterSelectionChange([], event);
        }
    }

    private filterByContext(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        switch (event.type) {
            case 'activeEditorChange': return this.filterActiveEditorChange(shortcuts, event);
            case 'activeTerminalChange': return this.filterActiveTerminalChange(shortcuts, event);
            case 'commandExecution': return this.filterCommandExecution(shortcuts, event);
            case 'documentClose': return this.filterDocumentClose(shortcuts, event);
            case 'fileSave': return this.filterFileSave(shortcuts, event);
            case 'intelliSenseTrigger': return this.filterIntelliSenseTrigger(shortcuts, event);
            case 'panelVisibilityChange': return this.filterPanelVisibilityChange(shortcuts, event);
            case 'peekDefinitionTrigger': return this.filterPeekDefinitionTrigger(shortcuts, event);
            case 'quickFixTrigger': return this.filterQuickFixTrigger(shortcuts, event);
            case 'referencesTrigger': return this.filterReferencesTrigger(shortcuts, event);
            case 'selectionChange': return this.filterSelectionChange(shortcuts, event);
            case 'textChange': return this.filterTextChange(shortcuts, event);
            case 'windowStateChange': return this.filterWindowStateChange(shortcuts, event);
            case 'debugStart': return this.filterDebugStart(shortcuts, event);
            case 'scrollChange': return this.filterScrollChange(shortcuts, event);
            case 'tipOfTheDay': return this.filterTipOfTheDay(shortcuts, event);
            default: return shortcuts;
        }
    }

    // ============================================================================
    // Complex Detection Logic (Text & Selection)
    // ============================================================================

    private filterTextChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        if (!event.context?.changes || event.context.changes.length === 0) {
            return [];
        }

        const change = event.context.changes[0] as vscode.TextDocumentContentChangeEvent;
        const isAddition = change.text.length > 0;
        const eventType = isAddition ? 'add' : 'delete';
        const line = change.range.start.line;
        const now = Date.now();

        // Update last text change time to prevent cursor movement detection while typing
        this.lastTextChangeTime = now;

        // 1. Event Aggregation
        if (this.currentEvent &&
            this.currentEvent.line === line &&
            this.currentEvent.eventType === eventType) {

            // Continue current event
            this.currentEvent.timestamp = now;
            this.currentEvent.count += isAddition ? change.text.length : change.rangeLength;

            if (isAddition) {
                if (this.currentEvent.text.length < this.MAX_EVENT_TEXT_LENGTH) {
                    const remaining = this.MAX_EVENT_TEXT_LENGTH - this.currentEvent.text.length;
                    this.currentEvent.text += change.text.substring(0, remaining);
                }
            }
        } else {
            // Start new event
            if (this.currentEvent) {
                this.pushToQueue(this.currentEvent);
            }

            this.currentEvent = {
                eventType: eventType,
                text: isAddition ? change.text.substring(0, this.MAX_EVENT_TEXT_LENGTH) : '',
                line: line,
                count: isAddition ? change.text.length : change.rangeLength,
                timestamp: now
            };
        }

        // 2. Run Detection Heuristics
        const detectedShortcuts: Shortcut[] = [];
        const current = this.currentEvent;

        // --- Multi-Cursor Editing Detection ---
        // Fix: Trim text to ignore whitespace/newline differences
        const currentTextTrimmed = current.text.trim();
        if (current.eventType === 'add' && currentTextTrimmed.length > 3) {
            const matches = this.recentEvents.filter(e =>
                e.eventType === 'add' &&
                e.line !== current.line &&
                e.text.trim() === currentTextTrimmed
            );

            if (matches.length > 0) {
                const adjacent = matches.find(e => Math.abs(e.line - current.line) === 1);
                if (adjacent) {
                    detectedShortcuts.push(...shortcuts.filter(s => s.shortcut.includes('Ctrl+Alt+')));
                } else {
                    detectedShortcuts.push(...shortcuts.filter(s =>
                        ['Alt+Click', 'Ctrl+D', 'Ctrl+F2'].some(k => s.shortcut.includes(k))
                    ));
                }
            }
        }

        // --- Line Duplication Detection ---
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return detectedShortcuts;
        }
        if (current.eventType === 'add') {
            const lineText = editor.document.lineAt(current.line).text.trim();
            // Fix: Relaxed condition. Just check if the resulting line matches a neighbor
            // and we are currently typing (count > 0).
            if (lineText.length > 3 && current.count > 0) {
                const neighbors = [-2, -1, 1, 2];
                for (const offset of neighbors) {
                    const checkLine = current.line + offset;
                    if (checkLine >= 0 && checkLine < editor.document.lineCount) {
                        const neighborText = editor.document.lineAt(checkLine).text.trim();
                        if (neighborText === lineText) {
                            detectedShortcuts.push(...shortcuts.filter(s =>
                                s.shortcut.includes('Shift+Alt+') || s.shortcut.includes('Ctrl+C')
                            ));
                            break;
                        }
                    }
                }
            }
        }

        if (current.eventType === 'delete') {
            // Detect if line is empty
            const isLineEmpty = editor.document.lineAt(current.line).text.trim().length === 0;
            if (current.count >= 5) {
                // Full line deletion
                if (isLineEmpty) {
                    const filtered = shortcuts.filter(s => s.shortcut.includes('Ctrl+Shift+K') || s.shortcut.includes('Ctrl+X'));
                    detectedShortcuts.push(...filtered);
                } else {
                    if (now - this.lastCtrlBackSpaceRecTime > 600000) { // 10 min debounce
                        const deletionShortcuts = shortcuts.filter(s => s.shortcut.includes('Ctrl+Backspace'));
                        if (deletionShortcuts.length > 0) {
                            this.lastCtrlBackSpaceRecTime = now;
                            detectedShortcuts.push(...deletionShortcuts);
                        }
                    }
                }
            }
        }

        // --- Comment Detection ---
        if (current.eventType === 'add' || current.eventType === 'delete') {
            const lang = editor.document.languageId;
            let commentChar = '';

            // Simple language mapping
            if (['typescript', 'javascript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'jsonc'].includes(lang)) {
                commentChar = '//';
            } else if (['python', 'ruby', 'perl', 'yaml', 'shellscript', 'dockerfile'].includes(lang)) {
                commentChar = '#';
            } else if (['html', 'xml'].includes(lang)) {
                commentChar = '<!--';
            } else if (['css', 'less', 'scss'].includes(lang)) {
                commentChar = '/*';
            }

            console.log('Language:', lang);
            console.log('Comment char:', commentChar);

            if (commentChar) {
                const lineText = editor.document.lineAt(current.line).text.trim();
                const isCommentAction =
                    (current.eventType === 'add' && lineText.startsWith(commentChar)) ||
                    (current.eventType === 'delete' && !lineText.startsWith(commentChar) && current.count <= commentChar.length + 1); // Heuristic for deletion

                console.log('lineText:', lineText);
                console.log('isCommentAction:', isCommentAction);

                if (isCommentAction) {
                    // Debounce to avoid spamming while typing //
                    if (now - this.lastCommentRecommendationTime > 600000) { // 10 min debounce
                        detectedShortcuts.push(...shortcuts.filter(s => s.shortcut === 'Ctrl+/'));
                        this.lastCommentRecommendationTime = now;
                    }
                }
            }
        }

        return detectedShortcuts;
    }

    private filterSelectionChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        if (!event.context?.editor || !event.context?.selections) {
            return [];
        }

        const selection = event.context.selections[0] as vscode.Selection;
        const editor = event.context.editor as vscode.TextEditor;
        const currentLine = selection.active.line;
        const currentColumn = selection.active.character;
        const lineObj = editor.document.lineAt(currentLine);
        const lineLength = lineObj.text.length;
        const firstNonWhitespace = lineObj.firstNonWhitespaceCharacterIndex;
        const detectedShortcuts: Shortcut[] = [];
        const now = Date.now();

        // Update hadSelection for Cut detection
        this.hadSelection = !selection.isEmpty;

        // --- Cursor Movement to Line Start/End ---
        if (selection.isEmpty) {
            // Fix: Ignore if text changed recently (typing)
            const isTyping = now - this.lastTextChangeTime < 500; // 500ms buffer

            if (!isTyping && this.previousCursorPosition && this.previousCursorPosition.line === currentLine) {
                const prevColumn = this.previousCursorPosition.character;

                // Fix: "Middle of line" >= 1 char from start/end
                const isPrevMiddle = prevColumn >= 1 && prevColumn <= lineLength - 1;

                // Moved to Start (Column 0 OR First Non-Whitespace)
                if ((currentColumn === 0 || currentColumn === firstNonWhitespace) && isPrevMiddle && prevColumn > firstNonWhitespace) {
                    detectedShortcuts.push(...shortcuts.filter(s => s.shortcut.includes('Fn+←')));
                }

                // Moved to End
                if (currentColumn === lineLength && isPrevMiddle) {
                    detectedShortcuts.push(...shortcuts.filter(s => s.shortcut.includes('Fn+→')));
                }
            }

            this.previousCursorPosition = { line: currentLine, character: currentColumn };
        } else {
            this.previousCursorPosition = null;
        }

        // --- Full Line Selection ---
        // Fix: Detect either all non-whitespace characters OR all characters
        const isAllChars =
            selection.start.character === 0 &&
            selection.end.character === lineLength;

        // Calculate last non-whitespace index
        const textTrimmedRight = lineObj.text.trimEnd();
        const lastNonWhitespace = textTrimmedRight.length;
        const isAllNonWhitespace =
            selection.start.character <= firstNonWhitespace &&
            selection.end.character >= lastNonWhitespace &&
            !(selection.start.character === selection.end.character); // Ensure not empty

        const isFullLineSelected = (isAllChars || isAllNonWhitespace) && selection.start.line === selection.end.line;

        if (isFullLineSelected && this.previousSelection) {
            const wasPartialSelection =
                !this.previousSelection.isEmpty &&
                this.previousSelection.start.line === selection.start.line &&
                (this.previousSelection.start.character > firstNonWhitespace ||
                    this.previousSelection.end.character < lastNonWhitespace);

            if (wasPartialSelection) {
                detectedShortcuts.push(...shortcuts.filter(s => s.shortcut.includes('Shift+Alt+→')));
            }
        }

        this.previousSelection = {
            isEmpty: selection.isEmpty,
            start: { line: selection.start.line, character: selection.start.character },
            end: { line: selection.end.line, character: selection.end.character }
        };

        return detectedShortcuts;
    }

    private pushToQueue(event: AggregatedEvent) {
        this.recentEvents.push(event);
        if (this.recentEvents.length > this.MAX_QUEUE_SIZE) {
            this.recentEvents.shift();
        }
    }

    // ============================================================================
    // Other Interaction Handlers
    // ============================================================================

    private filterActiveEditorChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        if (!event.context?.editor) return [];
        const ctx = event.context;
        const isMarkdown = ctx.languageId === 'markdown' || ctx.fileName?.endsWith('.md');

        if (isMarkdown) {
            return shortcuts.filter(s => s.shortcut.includes('Ctrl+K V') || s.shortcut.includes('Ctrl+Shift+V'));
        }
        return shortcuts.filter(s => !s.shortcut.includes('Ctrl+K V') && !s.shortcut.includes('Ctrl+Shift+V'));
    }

    private filterActiveTerminalChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        if (!event.context?.terminal) {
            return shortcuts.filter(s => s.shortcut.includes('Ctrl+↑ / Ctrl+↓') || s.shortcut.includes('Ctrl+`'));
        }
        return shortcuts;
    }

    private filterCommandExecution(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterDocumentClose(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return event.context?.document ? shortcuts : []; }
    private filterFileSave(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return event.context?.document ? shortcuts : []; }
    private filterIntelliSenseTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterPanelVisibilityChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterPeekDefinitionTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterQuickFixTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterReferencesTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterWindowStateChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return event.context?.state ? shortcuts : []; }
    private filterDebugStart(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterScrollChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }
    private filterTipOfTheDay(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] { return shortcuts; }

    // ============================================================================
    // Helpers
    // ============================================================================

    private selectBestShortcut(shortcuts: Shortcut[], event: InteractionEvent): Shortcut {
        // For textChange and selectionChange, ALWAYS show the first unlearned shortcut
        // This ensures we recommend the specific shortcut detected by our heuristics
        if (event.type === 'textChange' || event.type === 'selectionChange') {
            return shortcuts[0];
        }

        // For tipOfTheDay, always show the first unlearned tip (progressive learning)
        if (event.type === 'tipOfTheDay' && shortcuts.length > 0) {
            return shortcuts[0];
        }

        // For activeEditorChange, use weighted selection
        if (event.type === 'activeEditorChange' && shortcuts.length > 0) {
            // 65% chance to show the first shortcut, 35% chance to randomly select from all
            const random = Math.random();
            if (random < 0.65) {
                return shortcuts[0]; // First unlearned shortcut
            } else {
                // Randomly select from all shortcuts
                return this.selectRandomShortcut(shortcuts);
            }
        }

        // Prioritize specific shortcuts based on event type
        if (event.type === 'windowStateChange') {
            const altTab = shortcuts.find(s => s.shortcut === 'Alt+Tab');
            if (altTab) {
                return altTab;
            }
        }

        if (event.type === 'activeTerminalChange') {
            const ctrlBacktick = shortcuts.find(s => s.shortcut === 'Ctrl+`');
            if (ctrlBacktick) {
                return ctrlBacktick;
            }
            const ctrlUpDown = shortcuts.find(s => s.shortcut === 'Ctrl+↑ / Ctrl+↓');
            if (ctrlUpDown) {
                return ctrlUpDown;
            }
        }

        if (event.type === 'debugStart') {
            // Prioritize debugging shortcuts in order: F5 -> Shift+F5 -> F9 -> F10
            const priorityOrder = ['F5', 'Shift+F5', 'F9', 'F10'];
            for (const shortcutKey of priorityOrder) {
                const found = shortcuts.find(s => s.shortcut === shortcutKey);
                if (found) {
                    return found;
                }
            }
        }

        return this.selectRandomShortcut(shortcuts);
    }

    private selectRandomShortcut(shortcuts: Shortcut[]): Shortcut {
        const randomIndex = Math.floor(Math.random() * shortcuts.length);
        return shortcuts[randomIndex];
    }

    private async showRecommendation(shortcut: Shortcut, event: InteractionEvent): Promise<void> {
        const tipLabel = event.type === 'tipOfTheDay' ? 'Shortcut Tip of the Day' : 'Shortcut Tip';
        const message = `${tipLabel}: Use ${shortcut.shortcut} to ${this.formatAction(shortcut.action)}`;
        const response = await vscode.window.showInformationMessage(
            message,
            "I got it! Don't show again",
            "OK"
        );

        if (response === "I got it! Don't show again") {
            await this.learnedShortcutsManager.markAsLearned(shortcut.shortcut, shortcut.action);
        }
    }

    private getShortcutKey(shortcut: Shortcut): string {
        return `${shortcut.shortcut}:${shortcut.action}`;
    }

    private formatAction(action: string): string {
        let formatted = action.replace(/"/g, '').replace(/\n/g, ' ').trim();
        if (formatted.length > 0 && formatted[0] === formatted[0].toUpperCase()) {
            formatted = formatted[0].toLowerCase() + formatted.slice(1);
        }
        return formatted;
    }
}
