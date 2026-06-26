import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Components } from 'react-markdown';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, WrapText } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

interface MessageMarkdownProps {
    content: string;
    onCopyStatus?: (message: string) => void;
    isStreaming?: boolean;
    messageId?: string;
}

interface CodeBlockProps {
    code: string;
    language: string;
    onCopyStatus?: (message: string) => void;
    anchorId?: string;
    setContainerRef?: (node: HTMLDivElement | null) => void;
}

interface MarkdownCodeBlockMeta {
    language: string;
    lineCount: number;
}

const flattenNodeText = (node: React.ReactNode): string => {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flattenNodeText).join('');
    if (React.isValidElement(node)) return flattenNodeText(node.props.children);
    return '';
};

const sanitizeSchema = {
    ...defaultSchema,
    attributes: {
        ...defaultSchema.attributes,
        code: [...(defaultSchema.attributes?.code || []), ['className']],
        span: [...(defaultSchema.attributes?.span || []), ['className']],
        pre: [...(defaultSchema.attributes?.pre || []), ['className']]
    }
};

const countCodeFenceMarkers = (text: string): number => {
    const matches = text.match(/(^|\n)```/g);
    return matches ? matches.length : 0;
};

const getStreamingSafeContent = (content: string, isStreaming: boolean): string => {
    if (!isStreaming) return content;
    const fenceCount = countCodeFenceMarkers(content);
    if (fenceCount % 2 === 0) return content;
    // Keep an unclosed streamed fence rendered as a stable code block until completion.
    return `${content}\n\`\`\``;
};

const extractCodeBlocks = (content: string): MarkdownCodeBlockMeta[] => {
    const codeBlocks: MarkdownCodeBlockMeta[] = [];
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null = null;
    while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = String(match[1] || '').trim().toLowerCase() || 'text';
        const body = String(match[2] || '');
        const lineCount = body ? body.split('\n').length : 0;
        codeBlocks.push({ language, lineCount });
    }
    return codeBlocks;
};

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, onCopyStatus, anchorId, setContainerRef }) => {
    const [copied, setCopied] = useState(false);
    const [wrapLines, setWrapLines] = useState(false);

    const label = language || 'text';

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            onCopyStatus?.('Code block copied to clipboard.');
            window.setTimeout(() => setCopied(false), 1400);
        } catch {
            onCopyStatus?.('Clipboard copy failed.');
        }
    };

    return (
        <div id={anchorId} ref={setContainerRef} className="chat-codeblock not-prose">
            <div className="chat-codeblock-header">
                <span className="chat-codeblock-language">{label}</span>
                <div className="chat-codeblock-actions">
                    <button
                        type="button"
                        onClick={() => setWrapLines((v) => !v)}
                        className="chat-codeblock-button"
                        title={wrapLines ? 'Disable line wrap' : 'Enable line wrap'}
                        aria-label={wrapLines ? 'Disable line wrap' : 'Enable line wrap'}
                    >
                        <WrapText size={12} />
                        {wrapLines ? 'No Wrap' : 'Wrap'}
                    </button>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="chat-codeblock-button"
                        title="Copy code"
                        aria-label="Copy code"
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>
            <pre className={`chat-codeblock-pre ${wrapLines ? 'chat-codeblock-wrap' : ''}`}>
                <code className={language ? `language-${language}` : undefined}>{code}</code>
            </pre>
        </div>
    );
};

const MessageMarkdown: React.FC<MessageMarkdownProps> = ({ content, onCopyStatus, isStreaming = false, messageId }) => {
    const safeContent = useMemo(
        () => getStreamingSafeContent(content || '', isStreaming),
        [content, isStreaming]
    );
    const instanceIdRef = useRef(`md-${Math.random().toString(36).slice(2, 10)}`);
    const codeBlockRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [activeCodeBlockIndex, setActiveCodeBlockIndex] = useState(0);
    const codeBlocks = useMemo(() => extractCodeBlocks(safeContent), [safeContent]);
    const shouldShowCodeNavigator = codeBlocks.length > 1 && safeContent.length >= 900 && codeBlocks.some((block) => block.lineCount >= 12);

    useEffect(() => {
        if (codeBlocks.length === 0) {
            setActiveCodeBlockIndex(0);
            return;
        }
        if (activeCodeBlockIndex > codeBlocks.length - 1) {
            setActiveCodeBlockIndex(codeBlocks.length - 1);
        }
    }, [activeCodeBlockIndex, codeBlocks.length]);

    const jumpToCodeBlock = (index: number) => {
        if (!codeBlocks.length) return;
        const boundedIndex = Math.max(0, Math.min(index, codeBlocks.length - 1));
        const node = codeBlockRefs.current[boundedIndex];
        if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveCodeBlockIndex(boundedIndex);
            return;
        }
        const fallbackId = `chat-md-code-${instanceIdRef.current}-${boundedIndex + 1}`;
        const fallbackNode = document.getElementById(fallbackId);
        if (fallbackNode) {
            fallbackNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveCodeBlockIndex(boundedIndex);
        }
    };

    const components = useMemo<Components>(() => {
        let codeBlockIndex = 0;
        return ({
        pre({ children }) {
            return <>{children}</>;
        },
        code({ className, children, ...props }) {
            const value = flattenNodeText(children);
            const trimmed = value.replace(/\n$/, '');
            const languageMatch = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
            const language = languageMatch?.[1]?.toLowerCase() || '';
            const isBlock = Boolean(className?.includes('language-')) || value.includes('\n');

            if (!isBlock) {
                return (
                    <code className="chat-inline-code" {...props}>
                        {children}
                    </code>
                );
            }

            const anchorIndex = codeBlockIndex;
            codeBlockIndex += 1;
            const anchorId = `chat-md-code-${instanceIdRef.current}-${anchorIndex + 1}`;
            return (
                <CodeBlock
                    code={trimmed}
                    language={language}
                    onCopyStatus={onCopyStatus}
                    anchorId={anchorId}
                    setContainerRef={(node) => {
                        codeBlockRefs.current[anchorIndex] = node;
                    }}
                />
            );
        },
        a({ children, ...props }) {
            return (
                <a {...props} target="_blank" rel="noreferrer noopener">
                    {children}
                </a>
            );
        },
        table({ children }) {
            return (
                <div className="chat-table-wrap">
                    <table>{children}</table>
                </div>
            );
        }
    });
    }, [onCopyStatus]);

    return (
        <div className="chat-markdown" data-message-markdown-id={messageId || undefined}>
            {shouldShowCodeNavigator && (
                <div className="chat-code-navigator">
                    <button
                        type="button"
                        className="chat-code-navigator-button"
                        onClick={() => jumpToCodeBlock(activeCodeBlockIndex - 1)}
                        disabled={activeCodeBlockIndex <= 0}
                        aria-label="Previous code block"
                    >
                        <ChevronLeft size={12} />
                    </button>
                    <div className="chat-code-navigator-select-wrap">
                        <ChevronDown size={11} className="chat-code-navigator-caret" />
                        <select
                            value={activeCodeBlockIndex}
                            onChange={(e) => jumpToCodeBlock(Number(e.target.value))}
                            className="chat-code-navigator-select"
                            aria-label="Jump to code block"
                        >
                            {codeBlocks.map((block, index) => (
                                <option key={`${block.language}-${index}`} value={index}>
                                    {`Code ${index + 1} - ${block.language}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        className="chat-code-navigator-button"
                        onClick={() => jumpToCodeBlock(activeCodeBlockIndex + 1)}
                        disabled={activeCodeBlockIndex >= codeBlocks.length - 1}
                        aria-label="Next code block"
                    >
                        <ChevronRight size={12} />
                    </button>
                </div>
            )}
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[
                    [rehypeSanitize, sanitizeSchema],
                    rehypeHighlight
                ]}
                components={components}
            >
                {safeContent}
            </ReactMarkdown>
        </div>
    );
};

export default MessageMarkdown;
