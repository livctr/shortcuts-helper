import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export type InteractionType =
    | 'activeEditorChange'
    | 'textChange'
    | 'selectionChange'
    | 'fileSave'
    | 'documentClose'
    | 'activeTerminalChange'
    | 'windowStateChange'
    | 'commandExecution'
    | 'panelVisibilityChange'
    | 'intelliSenseTrigger'
    | 'peekDefinitionTrigger'
    | 'quickFixTrigger'
    | 'referencesTrigger'
    | 'debugStart'
    | 'scrollChange'
    | 'tipOfTheDay';

export interface InteractionEvent {
    type: InteractionType;
    timestamp: number;
    context?: any;
}

export class InteractionTracker extends EventEmitter {
    private disposables: vscode.Disposable[] = [];
    private lastScrollEventTime: number = 0;
    private recentScrolls: { time: number; amount: number }[] = [];
    private previousTopLines = new WeakMap<vscode.TextEditor, number>();
    private previousState = {
        editor: undefined as vscode.TextEditor | undefined,
        tabGroupCount: 0,
        activeTabGroupIndex: -1,
        tabCountInActiveGroup: 0,
        viewColumn: undefined as vscode.ViewColumn | undefined,
        isPreview: false
    };

    constructor() {
        super();
        this.setupListeners();
    }

    private setupListeners(): void {
        // Active editor changes with rich context
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                // Capture current state
                const tabGroups = vscode.window.tabGroups;
                const activeGroup = tabGroups.activeTabGroup;
                const activeTab = activeGroup?.activeTab;

                const currentState = {
                    // Editor info
                    editor,
                    viewColumn: editor?.viewColumn,

                    // Document info
                    isUntitled: editor?.document.isUntitled ?? false,
                    languageId: editor?.document.languageId,
                    fileName: editor?.document.fileName,

                    // Tab group info
                    tabGroupCount: tabGroups.all.length,
                    activeTabGroupIndex: tabGroups.all.indexOf(activeGroup!),
                    tabCountInActiveGroup: activeGroup?.tabs.length ?? 0,

                    // Tab info
                    isPreview: activeTab?.isPreview ?? false,
                    isPinned: activeTab?.isPinned ?? false,
                    tabLabel: activeTab?.label,

                    // Visible editors
                    visibleEditorCount: vscode.window.visibleTextEditors.length
                };

                // Calculate deltas
                const context = {
                    ...currentState,
                    previous: this.previousState,

                    // Change indicators
                    tabGroupCountChanged: currentState.tabGroupCount !== this.previousState.tabGroupCount,
                    tabGroupCountIncreased: currentState.tabGroupCount > this.previousState.tabGroupCount,
                    tabGroupCountDecreased: currentState.tabGroupCount < this.previousState.tabGroupCount,

                    viewColumnChanged: currentState.viewColumn !== this.previousState.viewColumn,

                    tabCountChanged: currentState.tabCountInActiveGroup !== this.previousState.tabCountInActiveGroup,
                    tabCountIncreased: currentState.tabCountInActiveGroup > this.previousState.tabCountInActiveGroup,

                    previewStatusChanged: currentState.isPreview !== this.previousState.isPreview,
                    becameNonPreview: this.previousState.isPreview && !currentState.isPreview,

                    // Same document check
                    sameDocument: editor?.document.uri.toString() ===
                        this.previousState.editor?.document.uri.toString()
                };

                this.emitEvent('activeEditorChange', context);

                // Update previous state
                this.previousState = {
                    editor,
                    tabGroupCount: currentState.tabGroupCount,
                    activeTabGroupIndex: currentState.activeTabGroupIndex,
                    tabCountInActiveGroup: currentState.tabCountInActiveGroup,
                    viewColumn: currentState.viewColumn,
                    isPreview: currentState.isPreview
                };
            })
        );

        // Text document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                this.emitEvent('textChange', { document: event.document, changes: event.contentChanges });
            })
        );

        // Selection changes
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection((event) => {
                this.emitEvent('selectionChange', { editor: event.textEditor, selections: event.selections });
            })
        );

        // Scroll changes (throttled to once every 10 minutes, requires >50 lines in 2s)
        this.disposables.push(
            vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
                const now = Date.now();
                const currentTop = event.visibleRanges[0].start.line;
                const prevTop = this.previousTopLines.get(event.textEditor);

                this.previousTopLines.set(event.textEditor, currentTop);

                if (prevTop === undefined) {
                    return;
                }

                const delta = Math.abs(currentTop - prevTop);
                this.recentScrolls.push({ time: now, amount: delta });

                // Clean up old events (keep last 2 seconds)
                const twoSecondsAgo = now - 2000;
                this.recentScrolls = this.recentScrolls.filter(s => s.time >= twoSecondsAgo);

                // Calculate total lines scrolled in the last 2 seconds
                const totalLines = this.recentScrolls.reduce((sum, s) => sum + s.amount, 0);

                if (totalLines > 50) {
                    const tenMinutesInMs = 10 * 60 * 1000; // 10 minutes
                    // Only emit scroll event if 10 minutes have passed since the last one
                    if (now - this.lastScrollEventTime >= tenMinutesInMs) {
                        this.emitEvent('scrollChange', { editor: event.textEditor, visibleRanges: event.visibleRanges });
                        this.lastScrollEventTime = now;
                        this.recentScrolls = []; // Reset to prevent immediate re-triggering
                    }
                }
            })
        );

        // File save
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.emitEvent('fileSave', { document });
            })
        );

        // Document close
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument((document) => {
                this.emitEvent('documentClose', { document });
            })
        );

        // Terminal changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTerminal((terminal) => {
                this.emitEvent('activeTerminalChange', { terminal });
            })
        );

        // Window state changes
        this.disposables.push(
            vscode.window.onDidChangeWindowState((state) => {
                this.emitEvent('windowStateChange', { state });
            })
        );

        // Debug session changes
        this.disposables.push(
            vscode.debug.onDidStartDebugSession((session) => {
                this.emitEvent('debugStart', { session });
            })
        );
    }

    private emitEvent(type: InteractionType, context?: any): void {
        const event: InteractionEvent = {
            type,
            timestamp: Date.now(),
            context
        };
        this.emit('interaction', event);
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
