interface YourExtensionHomeProps {
    itemId?: string | null;
}

const surfaceClassName = 'rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-2xl shadow-slate-950/30';

export default function YourExtensionHome({ itemId }: YourExtensionHomeProps) {
    return (
        <div className="min-h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-slate-100">
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <header className={surfaceClassName}>
                    <p className="text-sm uppercase tracking-[0.24em] text-sky-300">Installable Extension</p>
                    <h1 className="mt-3 text-3xl font-semibold text-white">Your Extension</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                        Replace this screen with your extension UI. The host route is already wired through the manifest in
                        `src/index.ts`.
                    </p>
                </header>

                <section className="grid gap-4 md:grid-cols-2">
                    <article className={surfaceClassName}>
                        <h2 className="text-lg font-medium text-white">Launch Context</h2>
                        <p className="mt-3 text-sm text-slate-300">
                            Extensions can receive the current `itemId` through the URL when launched from an asset action.
                        </p>
                        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 font-mono text-sm text-sky-200">
                            itemId: {itemId || 'none'}
                        </div>
                    </article>

                    <article className={surfaceClassName}>
                        <h2 className="text-lg font-medium text-white">Starter Checklist</h2>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li>Rename the package, manifest id, and route ids.</li>
                            <li>Adjust host capabilities to match the surfaces your extension actually uses.</li>
                            <li>Keep server tables and indexes under the `ext_your_extension_*` namespace.</li>
                        </ul>
                    </article>
                </section>
            </div>
        </div>
    );
}
