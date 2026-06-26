import React from 'react';
import { Info, AlertTriangle } from 'lucide-react';

export const MaintenanceInfo: React.FC = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
        <div className="bg-slate-800/30 border border-slate-800 p-6 rounded-3xl">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Info size={18} className="text-indigo-400" /> Backup Strategy</h3>
            <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Full Backup (.zip)</strong>: Best for migration. Includes <code>SYSTEM_MANIFEST.json</code>, <code>aimana_production_snapshot.db</code>, and mirrored local binaries under <code>uploads/</code> (including reference-library and linked local assets).</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Incremental Backup (.zip)</strong>: Captures records and binaries created/updated between the last successful backup cursor and the current snapshot window, including persisted Client Update and backup-state metadata. Bundle includes <code>DELTA_MANIFEST.json</code> and <code>DELTA_INFO.json</code>.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Project Move Capture</strong>: Item moves across projects are included in incrementals, including revision rows/assets linked to moved items.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Baseline Rule</strong>: Run at least one successful Full Backup first. Incremental backups depend on that baseline during restore.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Latest Update Rule</strong>: After imports, bulk edits, or release prep, run one more incremental backup before handoff so your most recent system changes are covered.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Automated Restore</strong>: Upload the Full baseline ZIP plus every Incremental ZIP created after it. AIMANA applies the Full manifest first, then incrementals in timeline order.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Partial Capture Guard</strong>: If binary fetches fail, the bundle still completes and writes details to <code>BACKUP_REPORT.json</code>. Review it and rerun the backup before cutover so no required assets are left behind.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Inline Asset Note</strong>: <code>ignoredInlineAssets</code> entries in <code>BACKUP_REPORT.json</code> are informational only. Those assets are embedded in manifest metadata and are not separate upload files.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Raw Backup (.db)</strong>: Fastest metadata recovery path, exported as a point-in-time SQLite snapshot. Requires matching <code>storage/uploads/</code> files to fully restore binary previews and downloads.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div> <span><strong>Security Note</strong>: Backups contain sensitive hashes. Ensure you store them in a secure, encrypted location.</span></li>
            </ul>
        </div>
        <div className="bg-slate-800/30 border border-slate-800 p-6 rounded-3xl">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500" /> Restoration Note</h3>
            <ul className="space-y-3 text-sm text-slate-400 leading-relaxed">
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div> <span><strong>Preferred Restore Path</strong>: Use Automated Restore in System Operations whenever possible. Manual restore is best reserved for emergency raw-database recovery or offline migration procedures.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div> <span><strong>Manual Full ZIP Restore</strong>: Stop the server, replace <code>storage/aimana.db</code> with <code>aimana_production_snapshot.db</code> (renamed), then extract <code>uploads/</code> into <code>storage/uploads/</code>.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div> <span><strong>Incremental Restore Order</strong>: Restore the selected Full Backup first, then upload every incremental bundle created after it in chronological order using <code>fromTimestamp</code>/<code>toTimestamp</code> from <code>DELTA_INFO.json</code>.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div> <span><strong>Restore Chain Check</strong>: Automated restore now rejects restore chains with gaps, overlaps, invalid ranges, or baseline mismatches instead of continuing with warnings only.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div> <span><strong>Automated Restore Scope</strong>: Automated restore only applies the Full and Incremental ZIP bundles you upload in that run. Deletions from source history are not replayed automatically.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div> <span><strong>If Report Is Partial</strong>: Check <code>BACKUP_REPORT.json</code> and remediate missing binaries before final cutover.</span></li>
                <li className="flex gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div> <span><strong>Raw DB Restore</strong>: Replace <code>storage/aimana.db</code> while server is offline. This restores metadata but depends on existing binary files on disk.</span></li>
            </ul>
        </div>
    </div>
);
