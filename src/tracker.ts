import * as vscode from 'vscode';

export interface InteractionEvent {
    type: 'textChange' | 'selectionChange' | 'activeEditorChange' | 'visibleRangeChange' | 'fileSave' | 'windowStateChange' | 'activeTerminalChange' | 'visibleEditorsChange';
    timestamp: number;
    data: any;
    context?: any;
}

export class InteractionTracker {
    private events: InteractionEvent[] = [];
    private readonly MAX_EVENTS = 50;
    private lastScrollTime = 0;
    private readonly SCROLL_DEBOUNCE_MS = 500;

    constructor() {
        // =====================================================================================
        // 1. Editor Interactions
        // =====================================================================================

        // Text Manipulation (Typing, Deleting, Pasting)
        vscode.workspace.onDidChangeTextDocument(this.onTextChange, this);

        // Cursor Movement & Selection
        vscode.window.onDidChangeTextEditorSelection(this.onSelectionChange, this);

        // Navigation/Reading (Scrolling)
        vscode.window.onDidChangeTextEditorVisibleRanges(this.onVisibleRangeChange, this);


        // =====================================================================================
        // 2. Window & Workbench Management
        // =====================================================================================

        // Tab Management (Switching tabs)
        vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange, this);

        // Editor Layout (Splitting)
        vscode.window.onDidChangeVisibleTextEditors(this.onVisibleEditorsChange, this);

        // Focus Changes (Window focus - Alt+Tab)
        vscode.window.onDidChangeWindowState(this.onWindowStateChange, this);


        // =====================================================================================
        // 3. File System & Project
        // =====================================================================================

        // Persistence (Saving)
        vscode.workspace.onDidSaveTextDocument(this.onFileSave, this);


        // =====================================================================================
        // 4. Terminal & Tasks
        // =====================================================================================

        // Focus Changes (Terminal)
        vscode.window.onDidChangeActiveTerminal(this.onActiveTerminalChange, this);
    }

    // =====================================================================================
    // 1. Editor Interactions Handlers
    // =====================================================================================

    private onTextChange(event: vscode.TextDocumentChangeEvent) {
        if (event.contentChanges.length === 0) return;

        // Capture snapshot of affected lines
        const affectedLines: string[] = [];
        for (const change of event.contentChanges) {
            const startLine = change.range.start.line;
            const endLine = change.range.start.line + (change.text.match(/\n/g) || []).length;

            // Be careful with large changes, limit snapshot size
            if (endLine - startLine < 10) {
                // Capture context: 1 line before and 1 line after
                const contextStart = Math.max(0, startLine - 1);
                const contextEnd = Math.min(event.document.lineCount - 1, endLine + 1);

                for (let i = contextStart; i <= contextEnd; i++) {
                    affectedLines.push(event.document.lineAt(i).text);
                }
            }
        }

        this.addEvent({
            type: 'textChange',
            timestamp: Date.now(),
            data: event,
            context: {
                affectedLines
            }
        });
    }

    private onSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
        this.addEvent({
            type: 'selectionChange',
            timestamp: Date.now(),
            data: event
        });
    }

    private onVisibleRangeChange(event: vscode.TextEditorVisibleRangesChangeEvent) {
        const now = Date.now();
        if (now - this.lastScrollTime < this.SCROLL_DEBOUNCE_MS) {
            return;
        }
        this.lastScrollTime = now;

        this.addEvent({
            type: 'visibleRangeChange',
            timestamp: now,
            data: {
                visibleRanges: event.visibleRanges,
                fileName: event.textEditor.document.fileName
            }
        });
    }

    // =====================================================================================
    // 2. Window & Workbench Management Handlers
    // =====================================================================================

    private onActiveEditorChange(editor: vscode.TextEditor | undefined) {
        if (!editor) return; // User clicked outside VS Code or closed all tabs
        this.addEvent({
            type: 'activeEditorChange',
            timestamp: Date.now(),
            data: { fileName: editor.document.fileName }
        });
    }

    private onVisibleEditorsChange(editors: readonly vscode.TextEditor[]) {
        this.addEvent({
            type: 'visibleEditorsChange',
            timestamp: Date.now(),
            data: { count: editors.length }
        });
    }

    private onWindowStateChange(state: vscode.WindowState) {
        this.addEvent({
            type: 'windowStateChange',
            timestamp: Date.now(),
            data: { focused: state.focused }
        });
    }

    // =====================================================================================
    // 3. File System & Project Handlers
    // =====================================================================================

    private onFileSave(document: vscode.TextDocument) {
        this.addEvent({
            type: 'fileSave',
            timestamp: Date.now(),
            data: { fileName: document.fileName, language: document.languageId }
        });
    }

    // =====================================================================================
    // 4. Terminal & Tasks Handlers
    // =====================================================================================

    private onActiveTerminalChange(terminal: vscode.Terminal | undefined) {
        if (!terminal) return;
        this.addEvent({
            type: 'activeTerminalChange',
            timestamp: Date.now(),
            data: { name: terminal.name }
        });
    }

    // =====================================================================================
    // Utilities
    // =====================================================================================

    private addEvent(event: InteractionEvent) {
        this.events.push(event);
        if (this.events.length > this.MAX_EVENTS) {
            this.events.shift();
        }
    }

    public getRecentEvents(): InteractionEvent[] {
        return [...this.events];
    }
}
