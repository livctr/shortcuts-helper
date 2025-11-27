import * as vscode from 'vscode';
import * as path from 'path';
import { ShortcutsLoader } from './shortcuts-loader';
import { InteractionTracker } from './tracker';
import { Analyzer } from './analyzer';
import { LearnedShortcutsManager } from './learned-shortcuts-manager';
import { LearnedShortcutsViewer } from './learned-shortcuts-viewer';

export function activate(context: vscode.ExtensionContext) {
    console.log('Shortcuts Helper extension is now active!');

    // Initialize shortcuts loader
    const csvPath = path.join(context.extensionPath, 'shortcuts/shortcuts_curated.csv');
    const shortcutsLoader = new ShortcutsLoader(csvPath);
    shortcutsLoader.load();

    // Initialize learned shortcuts manager
    const learnedShortcutsManager = new LearnedShortcutsManager(context.globalState);

    // Initialize analyzer
    const analyzer = new Analyzer(shortcutsLoader, learnedShortcutsManager);

    // Initialize tracker
    const tracker = new InteractionTracker();

    // Connect tracker to analyzer
    tracker.on('interaction', (event) => {
        analyzer.analyzeInteraction(event);
    });

    // Show tip of the day on startup
    const tipEvent = {
        type: 'tipOfTheDay' as const,
        timestamp: Date.now(),
        context: {}
    };
    analyzer.analyzeInteraction(tipEvent);

    // Register disposables
    context.subscriptions.push(tracker);

    // Register command to view learned shortcuts
    const viewLearnedShortcutsCommand = vscode.commands.registerCommand(
        'shortcuts-helper.viewLearnedShortcuts',
        () => {
            const viewer = new LearnedShortcutsViewer(context, learnedShortcutsManager);
            viewer.show();
        }
    );

    context.subscriptions.push(viewLearnedShortcutsCommand);
}

export function deactivate() {
    console.log('Shortcuts Helper extension is now deactivated.');
}
