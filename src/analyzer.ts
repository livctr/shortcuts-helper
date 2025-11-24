import * as vscode from 'vscode';
import { InteractionEvent } from './tracker';

export interface Recommendation {
    id: string;
    message: string;
    shortcut: string;
}

export class Analyzer {
    private lastAnalyzedTimestamp: number = 0;
    private lastScrollRecommendationTime: number = 0;
    private readonly SCROLL_RECOMMENDATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

    public analyze(events: InteractionEvent[]): Recommendation | null {
        if (events.length === 0) return null;

        const lastEvent = events[events.length - 1];

        // Prevent re-analyzing the same event
        if (lastEvent.timestamp <= this.lastAnalyzedTimestamp) {
            return null;
        }
        this.lastAnalyzedTimestamp = lastEvent.timestamp;

        console.log('Analyzing event:', lastEvent.type, JSON.stringify(lastEvent.data));

        return this.detectToggleLineComment(events, lastEvent)
            || this.detectDeleteWordLeft(events, lastEvent)
            || this.detectCopyLineDown(events, lastEvent)
            || this.detectMoveLine(events, lastEvent)
            || this.detectNextFindMatch(events, lastEvent)
            || this.detectTabSwitching(events, lastEvent)
            || this.detectSplitEditor(events, lastEvent)
            || this.detectToggleTerminal(events, lastEvent)
            || this.detectSave(events, lastEvent)
            || this.detectScrolling(events, lastEvent);
    }

    private getPrevTextChange(events: InteractionEvent[], startIndex: number): InteractionEvent | null {
        for (let i = startIndex; i >= 0; i--) {
            if (events[i].type === 'textChange') {
                return events[i];
            }
        }
        return null;
    }

    // Rule: Ctrl+/ (Toggle Line Comment)
    private detectToggleLineComment(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type !== 'textChange') return null;

        const changes = lastEvent.data.contentChanges;
        if (changes.length === 1 && changes[0].text === '/') {
            const prevTextEvent = this.getPrevTextChange(events, events.length - 2);

            if (prevTextEvent && prevTextEvent.data.contentChanges.length === 1 && prevTextEvent.data.contentChanges[0].text === '/') {
                const range = changes[0].range;
                const line = lastEvent.data.document.lineAt(range.start.line);
                const textBefore = line.text.substring(0, range.start.character + 1);
                if (textBefore.trim() === '//') {
                    return {
                        id: 'toggleLineComment',
                        message: 'toggle line comment',
                        shortcut: 'Ctrl+/'
                    };
                }
            }
        }
        return null;
    }

    // Rule: Ctrl+Backspace (Delete Word Left)
    private detectDeleteWordLeft(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type !== 'textChange') return null;

        if (lastEvent.data.contentChanges.length === 1 && lastEvent.data.contentChanges[0].text === '') {
            let deletionCount = 0;
            for (let i = events.length - 1; i >= 0; i--) {
                const e = events[i];
                if (e.type === 'textChange') {
                    if (e.data.contentChanges.length === 1 && e.data.contentChanges[0].text === '' && e.data.contentChanges[0].rangeLength === 1) {
                        deletionCount++;
                    } else {
                        break;
                    }
                }
            }

            if (deletionCount >= 3) {
                return {
                    id: 'deleteWordLeft',
                    message: 'delete word left',
                    shortcut: 'Ctrl+Backspace'
                };
            }
        }
        return null;
    }

    // Rule: Shift+Alt+Down (Copy Line Down)
    private detectCopyLineDown(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type !== 'textChange') return null;

        if (lastEvent.data.contentChanges.length === 1) {
            const change = lastEvent.data.contentChanges[0];
            if (change.text.includes('\n')) {
                if (lastEvent.context && lastEvent.context.affectedLines) {
                    const lines = lastEvent.context.affectedLines;
                    for (let i = 0; i < lines.length - 1; i++) {
                        const current = lines[i].trim();
                        const next = lines[i + 1].trim();
                        if (current.length > 0 && current === next) {
                            return {
                                id: 'copyLineDown',
                                message: 'copy line down',
                                shortcut: 'Shift+Alt+Down'
                            };
                        }
                    }
                }
            }
        }
        return null;
    }

    // Rule: Alt+Up/Down (Move Line)
    private detectMoveLine(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type !== 'textChange') return null;

        if (lastEvent.data.contentChanges.length === 1) {
            const change = lastEvent.data.contentChanges[0];
            if (change.text.includes('\n')) {
                const prevTextEvent = this.getPrevTextChange(events, events.length - 2);
                if (prevTextEvent && prevTextEvent.data.contentChanges.length === 1 && prevTextEvent.data.contentChanges[0].text === '') {
                    const deletedLength = prevTextEvent.data.contentChanges[0].rangeLength;
                    const insertedLength = change.text.length;
                    if (Math.abs(deletedLength - insertedLength) <= 2 && deletedLength > 5) {
                        return {
                            id: 'moveLine',
                            message: 'move line',
                            shortcut: 'Alt+Up/Down'
                        };
                    }
                }
            }
        }
        return null;
    }

    // Rule: Ctrl+D (Add Selection to Next Find Match)
    private detectNextFindMatch(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type !== 'selectionChange') return null;

        const currentSel = lastEvent.data.selections[0];
        if (!currentSel.isEmpty) {
            const doc = lastEvent.data.textEditor.document;
            const text = doc.getText(currentSel);

            for (let i = events.length - 2; i >= 0; i--) {
                const e = events[i];
                if (e.type === 'selectionChange') {
                    const prevSel = e.data.selections[0];
                    if (!prevSel.isEmpty) {
                        const prevText = e.data.textEditor.document.getText(prevSel);
                        if (text === prevText && text.length > 1 && !currentSel.isEqual(prevSel)) {
                            return {
                                id: 'addSelectionToNextFindMatch',
                                message: 'select next occurrence',
                                shortcut: 'Ctrl+D'
                            };
                        }
                    }
                }
            }
        }
        return null;
    }

    // Rule: Ctrl+Tab (Switching Tabs)
    private detectTabSwitching(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type === 'activeEditorChange') {
            return {
                id: 'switchTabs',
                message: 'switch tabs',
                shortcut: 'Ctrl+Tab'
            };
        }
        return null;
    }

    // Rule: Ctrl+\ (Split Editor)
    private detectSplitEditor(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type === 'visibleEditorsChange') {
            // Find previous visibleEditorsChange event to compare count
            for (let i = events.length - 2; i >= 0; i--) {
                if (events[i].type === 'visibleEditorsChange') {
                    if (lastEvent.data.count > events[i].data.count) {
                        return {
                            id: 'splitEditor',
                            message: 'split editor',
                            shortcut: 'Ctrl+\\'
                        };
                    }
                    break;
                }
            }
        }
        return null;
    }

    // Rule: Ctrl+` (Toggle Terminal)
    private detectToggleTerminal(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type === 'activeTerminalChange') {
            return {
                id: 'toggleTerminal',
                message: 'toggle terminal',
                shortcut: 'Ctrl+`'
            };
        }
        return null;
    }

    // Rule: Ctrl+S (Save)
    private detectSave(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type === 'fileSave') {
            return {
                id: 'saveFile',
                message: 'save file',
                shortcut: 'Ctrl+S'
            };
        }
        return null;
    }

    // Rule: Ctrl+G or PageUp/Down (Scrolling)
    private detectScrolling(events: InteractionEvent[], lastEvent: InteractionEvent): Recommendation | null {
        if (lastEvent.type === 'visibleRangeChange') {
            const now = Date.now();
            if (now - this.lastScrollRecommendationTime > this.SCROLL_RECOMMENDATION_COOLDOWN) {
                this.lastScrollRecommendationTime = now;
                return {
                    id: 'smartNavigation',
                    message: 'jump to line, or PageUp/Down to scroll faster',
                    shortcut: 'Ctrl+G'
                };
            }
        }
        return null;
    }
}
