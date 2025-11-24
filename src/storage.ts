import * as vscode from 'vscode';

export class StorageService {
    private static readonly LEARNED_KEY = 'shortcuts-helper.learned';

    constructor(private context: vscode.ExtensionContext) { }

    public markAsLearned(shortcutId: string): void {
        const learned = this.getLearnedShortcuts();
        if (!learned.includes(shortcutId)) {
            learned.push(shortcutId);
            this.context.globalState.update(StorageService.LEARNED_KEY, learned);
        }
    }

    public isLearned(shortcutId: string): boolean {
        const learned = this.getLearnedShortcuts();
        return learned.includes(shortcutId);
    }

    public getLearnedShortcuts(): string[] {
        return this.context.globalState.get<string[]>(StorageService.LEARNED_KEY, []);
    }
}
