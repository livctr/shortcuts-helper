import * as vscode from 'vscode';
import { InteractionTracker } from './tracker';
import { Analyzer, Recommendation } from './analyzer';
import { Configuration } from './config';

export function activate(context: vscode.ExtensionContext) {
    console.log('Shortcuts Helper is active');

    const tracker = new InteractionTracker();
    const analyzer = new Analyzer();
    const config = new Configuration();

    let lastRecommendationTime = 0;

    const interval = setInterval(() => {
        const events = tracker.getRecentEvents();
        const recommendation = analyzer.analyze(events);

        if (recommendation) {
            const now = Date.now();
            if (now - lastRecommendationTime > config.cooldownInterval) {
                lastRecommendationTime = now;
                showRecommendation(recommendation);
            }
        }
    }, 1000);

    context.subscriptions.push({ dispose: () => clearInterval(interval) });

    function showRecommendation(rec: Recommendation) {
        vscode.window.showInformationMessage(
            `Tip: Use ${rec.shortcut} to ${rec.message}`
        );
    }
}

export function deactivate() { }
