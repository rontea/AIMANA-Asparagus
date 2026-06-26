import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditPaginationProps {
    currentPage: number;
    totalPages: number;
    totalLogs: number;
    itemsPerPage: number;
    isLoading: boolean;
    onPageChange: (page: number) => void;
}

export const AuditPagination: React.FC<AuditPaginationProps> = ({
    currentPage, totalPages, totalLogs, itemsPerPage, isLoading, onPageChange
}) => {
    if (totalPages <= 0) return null;

    const startIdx = (currentPage - 1) * itemsPerPage + 1;
    const endIdx = Math.min(currentPage * itemsPerPage, totalLogs);

    const renderPageNumbers = () => {
        const pages = [];
        const windowSize = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + windowSize - 1);
        
        if (end === totalPages) start = Math.max(1, end - windowSize + 1);

        for (let i = start; i <= end; i++) {
            pages.push(
                <button
                    key={i}
                    onClick={() => onPageChange(i)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        currentPage === i 
                        ? 'bg-indigo-600 text-white shadow-lg' 
                        : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                    }`}
                >
                    {i}
                </button>
            );
        }
        return pages;
    };

    return (
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Showing {startIdx} to {endIdx} of {totalLogs} entries
            </div>
            
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1 || isLoading}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
                
                <div className="flex items-center gap-1">
                    {renderPageNumbers()}
                </div>

                <button 
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || isLoading}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
};