import * as vscode from 'vscode';
import { InteractionEvent } from './tracker';
import { ShortcutsLoader, Shortcut } from './shortcuts-loader';
import { LearnedShortcutsManager } from './learned-shortcuts-manager';

export class Analyzer {
    private lastRecommendationTime: number = 0;
    private cooldownInterval: number;
    private sessionRecommendationLimit: number;
    private shownShortcuts: Set<string> = new Set();

    constructor(
        private shortcutsLoader: ShortcutsLoader,
        private learnedShortcutsManager: LearnedShortcutsManager
    ) {
        const config = vscode.workspace.getConfiguration('shortcutsHelper');
        this.cooldownInterval = config.get<number>('cooldownInterval', 300000);
        this.sessionRecommendationLimit = config.get<number>('sessionRecommendationLimit', 3);
    }

    public async analyzeInteraction(event: InteractionEvent): Promise<void> {
        // Check cooldown
        const now = Date.now();
        if (now - this.lastRecommendationTime < this.cooldownInterval) {
            return;
        }

        // Check session limit
        // If we've reached the limit, we can only show shortcuts we've already shown
        const isSessionLimitReached = this.shownShortcuts.size >= this.sessionRecommendationLimit;

        // Get shortcuts matching this interaction type
        const matchingShortcuts = this.shortcutsLoader.getShortcutsByType(event.type);

        if (matchingShortcuts.length === 0) {
            return;
        }

        // Apply context-specific filtering
        const filteredShortcuts = this.filterByContext(matchingShortcuts, event);

        if (filteredShortcuts.length === 0) {
            return;
        }

        // Filter out learned shortcuts
        const unlearnedShortcuts = filteredShortcuts.filter(
            shortcut => !this.learnedShortcutsManager.isLearned(shortcut.shortcut, shortcut.action)
        );

        if (unlearnedShortcuts.length === 0) {
            return;
        }

        // Apply session limit filtering
        let candidates = unlearnedShortcuts;
        if (isSessionLimitReached) {
            candidates = unlearnedShortcuts.filter(s => this.shownShortcuts.has(this.getShortcutKey(s)));
        }

        if (candidates.length === 0) {
            return;
        }

        // Select the best shortcut to show
        const selectedShortcut = this.selectBestShortcut(candidates, event);

        // Update state BEFORE showing recommendation to prevent race conditions
        this.lastRecommendationTime = now;
        this.shownShortcuts.add(this.getShortcutKey(selectedShortcut));

        // Show recommendation
        await this.showRecommendation(selectedShortcut);
    }

    private filterByContext(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Apply context-specific filtering based on event type
        switch (event.type) {
            case 'activeEditorChange':
                return this.filterActiveEditorChange(shortcuts, event);

            case 'activeTerminalChange':
                return this.filterActiveTerminalChange(shortcuts, event);

            case 'commandExecution':
                return this.filterCommandExecution(shortcuts, event);

            case 'documentClose':
                return this.filterDocumentClose(shortcuts, event);

            case 'fileSave':
                return this.filterFileSave(shortcuts, event);

            case 'intelliSenseTrigger':
                return this.filterIntelliSenseTrigger(shortcuts, event);

            case 'panelVisibilityChange':
                return this.filterPanelVisibilityChange(shortcuts, event);

            case 'peekDefinitionTrigger':
                return this.filterPeekDefinitionTrigger(shortcuts, event);

            case 'quickFixTrigger':
                return this.filterQuickFixTrigger(shortcuts, event);

            case 'referencesTrigger':
                return this.filterReferencesTrigger(shortcuts, event);

            case 'selectionChange':
                return this.filterSelectionChange(shortcuts, event);

            case 'textChange':
                return this.filterTextChange(shortcuts, event);

            case 'windowStateChange':
                return this.filterWindowStateChange(shortcuts, event);

            case 'debugStart':
                return this.filterDebugStart(shortcuts, event);

            case 'debugStop':
                return this.filterDebugStop(shortcuts, event);

            default:
                return shortcuts;
        }
    }

    // ============================================================================
    // Individual Interaction Type Handlers
    // ============================================================================

    private filterActiveEditorChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Only recommend if there's an active editor
        if (!event.context?.editor) {
            return [];
        }

        const ctx = event.context;

        // Debug: Show filename information as popup
        const debugMsg = `DEBUG: File="${ctx.fileName?.split('/').pop() || 'unknown'}" | Untitled=${ctx.isUntitled} | TabInc=${ctx.tabCountIncreased}`;
        vscode.window.showInformationMessage(debugMsg);

        // Check if current file is markdown
        const isMarkdown = ctx.languageId === 'markdown' ||
            ctx.fileName?.endsWith('.md') ||
            ctx.fileName?.endsWith('.markdown');

        if (isMarkdown) {
            // For markdown files, only show markdown preview shortcuts
            return shortcuts.filter(s =>
                s.shortcut.includes('Ctrl+K V') || s.shortcut.includes('Ctrl+Shift+V')
            );
        }

        // For non-markdown files, exclude markdown shortcuts
        return shortcuts.filter(s =>
            !s.shortcut.includes('Ctrl+K V') && !s.shortcut.includes('Ctrl+Shift+V')
        );
    }

    private filterActiveTerminalChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Only recommend if there's an active terminal
        if (!event.context?.terminal) {
            return [];
        }
        return shortcuts;
    }

    private filterCommandExecution(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Command execution events are generally valid
        // Could add specific command filtering here if needed
        return shortcuts;
    }

    private filterDocumentClose(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Only recommend if a document was actually closed
        if (!event.context?.document) {
            return [];
        }
        return shortcuts;
    }

    private filterFileSave(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Only recommend if a document was actually saved
        if (!event.context?.document) {
            return [];
        }
        return shortcuts;
    }

    private filterIntelliSenseTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // IntelliSense events are generally valid when triggered
        return shortcuts;
    }

    private filterPanelVisibilityChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Panel visibility changes are generally valid
        return shortcuts;
    }

    private filterPeekDefinitionTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Peek definition events are generally valid when triggered
        return shortcuts;
    }

    private filterQuickFixTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Quick fix events are generally valid when triggered
        return shortcuts;
    }

    private filterReferencesTrigger(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // References events are generally valid when triggered
        return shortcuts;
    }

    private filterSelectionChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Only recommend if there's an active editor and selections
        if (!event.context?.editor || !event.context?.selections) {
            return [];
        }
        return shortcuts;
    }

    private filterTextChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Only recommend if there were actual changes
        if (!event.context?.changes || event.context.changes.length === 0) {
            return [];
        }
        return shortcuts;
    }

    private filterWindowStateChange(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Only recommend if the window state actually changed
        if (!event.context?.state) {
            return [];
        }
        return shortcuts;
    }

    private filterDebugStart(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Debug start events are generally valid when triggered
        return shortcuts;
    }

    private filterDebugStop(shortcuts: Shortcut[], event: InteractionEvent): Shortcut[] {
        // Debug stop events are generally valid when triggered
        return shortcuts;
    }

    private selectBestShortcut(shortcuts: Shortcut[], event: InteractionEvent): Shortcut {
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

    private async showRecommendation(shortcut: Shortcut): Promise<void> {
        const message = `Shortcut Tip: Use ${shortcut.shortcut} to ${this.formatAction(shortcut.action)}`;
        const response = await vscode.window.showInformationMessage(
            message,
            "I got it! Don't show again",
            "OK"
        );

        // If user clicked "I got it!", mark as learned
        if (response === "I got it! Don't show again") {
            await this.learnedShortcutsManager.markAsLearned(shortcut.shortcut, shortcut.action);
        }
    }

    private getShortcutKey(shortcut: Shortcut): string {
        return `${shortcut.shortcut}:${shortcut.action}`;
    }

    private formatAction(action: string): string {
        // Convert action to lowercase and ensure it starts with a verb
        // Remove quotes and newlines for display
        let formatted = action.replace(/"/g, '').replace(/\n/g, ' ').trim();

        // If the action doesn't start with a lowercase letter, make it lowercase
        if (formatted.length > 0 && formatted[0] === formatted[0].toUpperCase()) {
            formatted = formatted[0].toLowerCase() + formatted.slice(1);
        }

        return formatted;
    }
}
