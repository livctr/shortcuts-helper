import * as vscode from 'vscode';

export class Configuration {
    private get config() {
        return vscode.workspace.getConfiguration('shortcutsHelper');
    }

    get cooldownInterval(): number {
        return this.config.get<number>('cooldownInterval', 5000);
    }
}
