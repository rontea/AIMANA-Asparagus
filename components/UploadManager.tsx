
import React from 'react';
import { UploadItem } from '../types';
import { File, CheckCircle, XCircle, Loader2, X, Info } from 'lucide-react';

interface UploadManagerProps {
  uploads: UploadItem[];
  onClose: () => void;
  onViewItem?: (itemId: string) => void;
}

const UploadManager: React.FC<UploadManagerProps> = ({ uploads, onClose, onViewItem }) => {
  if (uploads.length === 0) return null;

  // Calculate summary
  const activeCount = uploads.filter(u => u.status === 'uploading' || u.status === 'pending').length;
  const isComplete = activeCount === 0;

  return (
    <div className="fixed bottom-6 right-6 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-40 flex flex-col max-h-[400px] animate-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="bg-slate-800 p-3 px-4 flex justify-between items-center border-b border-slate-700">
        <h3 className="text-sm font-semibold text-white flex items-center">
          {isComplete ? 'Complete' : `Uploading ${activeCount}...`}
        </h3>
        <button 
          onClick={onClose} 
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {uploads.map((item) => (
          <div key={item.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 relative overflow-hidden group">
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center overflow-hidden flex-1">
                <div className="bg-slate-700 p-1.5 rounded mr-3 shrink-0">
                  <File size={16} className="text-slate-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 font-medium truncate" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.status === 'error' ? (
                      <span className="text-red-400">{item.errorMessage}</span>
                    ) : (
                      <span>{(item.file.size / 1024).toFixed(0)} KB</span>
                    )}
                  </p>
                </div>
              </div>
              
              <div className="ml-2 shrink-0 flex items-center gap-2">
                {item.status === 'uploading' && <Loader2 size={16} className="animate-spin text-indigo-400" />}
                {item.status === 'success' && (
                  <>
                    {onViewItem && item.itemId && (
                      <button 
                        onClick={() => onViewItem(item.itemId!)}
                        className="p-1 text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 rounded"
                        title="View Metadata"
                      >
                        <Info size={16} />
                      </button>
                    )}
                    <CheckCircle size={16} className="text-green-400" />
                  </>
                )}
                {item.status === 'error' && <XCircle size={16} className="text-red-400" />}
              </div>
            </div>

            {/* Progress Bar */}
            {item.status === 'uploading' && (
              <div className="mt-2 h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default UploadManager;
