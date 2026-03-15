import React, { useState, useRef, useEffect } from 'react';
import { X, Clock, Plus, MessageSquare, Send, Copy, ThumbsUp, ThumbsDown, ArrowUp, Square, Minus, Check, Pencil } from 'lucide-react';
import { Session, Message, ContentBlock } from '../types';
import { generateMockDiff } from '../services/mockGit';
import { MessageRenderer } from './message/MessageRenderer';
import { STRUCTURED_MOCK_RESPONSES } from '../utils/mockResponses';
import { backend } from '../services/backend';

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.aiBackend !== undefined;
}
let mockResponseIndex = 0;

export function SessionWindow({
  session,
  onUpdate,
  onClose,
  onOpenReview,
  fullScreen = false,
  height,
  animateHeight = false,
  onHeaderDoubleClick
}: {
  session: Session,
  onUpdate: (s: Session) => void,
  onClose?: () => void,
  onOpenReview?: () => void,
  fullScreen?: boolean,
  height?: number,
  animateHeight?: boolean,
  onHeaderDoubleClick?: (e: React.MouseEvent) => void
}) {
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);

  const isStreamingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const backendSessionIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [session.messages, isStreaming]);

  // Backend event listeners for Electron mode
  useEffect(() => {
    if (!isElectron()) return;

    const blockMap = new Map<number, ContentBlock>();

    const handleBlockStart = (data: { session_id: string; block_index: number; block: ContentBlock }) => {
      if (data.session_id !== backendSessionIdRef.current) return;
      blockMap.set(data.block_index, { ...data.block });
      updateAssistantBlocks(blockMap);
    };

    const handleBlockDelta = (data: { session_id: string; block_index: number; delta: any }) => {
      if (data.session_id !== backendSessionIdRef.current) return;
      const block = blockMap.get(data.block_index);
      if (!block) return;

      if (block.type === 'text' && data.delta.content) {
        (block as any).content += data.delta.content;
      } else if (block.type === 'code' && data.delta.content) {
        (block as any).code += data.delta.content;
      } else if (block.type === 'tool_call' && data.delta.args) {
        (block as any).args += data.delta.args;
      }
      blockMap.set(data.block_index, { ...block });
      updateAssistantBlocks(blockMap);
    };

    const handleBlockStop = (data: { session_id: string; block_index: number }) => {
      if (data.session_id !== backendSessionIdRef.current) return;
      const block = blockMap.get(data.block_index);
      if (block && block.type === 'tool_call') {
        (block as any).status = 'done';
        blockMap.set(data.block_index, { ...block });
        updateAssistantBlocks(blockMap);
      }
    };

    const handleMessageComplete = (data: { session_id: string }) => {
      if (data.session_id !== backendSessionIdRef.current) return;
      setIsStreaming(false);
      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;
      isStreamingRef.current = false;
      blockMap.clear();
    };

    const handleMessageError = (data: { session_id: string; error: { code: number; message: string } }) => {
      if (data.session_id !== backendSessionIdRef.current) return;
      setIsStreaming(false);
      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;
      isStreamingRef.current = false;
      blockMap.clear();
      console.error('[backend error]', data.error);
    };

    const updateAssistantBlocks = (blocks: Map<number, ContentBlock>) => {
      const sortedBlocks = Array.from(blocks.entries())
        .sort(([a], [b]) => a - b)
        .map(([_, block]) => block);

      const updated = {
        ...sessionRef.current,
        messages: sessionRef.current.messages.map(m =>
          m.id === streamingMessageIdRef.current
            ? { ...m, blocks: sortedBlocks }
            : m
        ),
      };
      sessionRef.current = updated;
      onUpdate(updated);
    };

    backend.onBlockStart(handleBlockStart);
    backend.onBlockDelta(handleBlockDelta);
    backend.onBlockStop(handleBlockStop);
    backend.onMessageComplete(handleMessageComplete);
    backend.onMessageError(handleMessageError);
  }, []);

  useEffect(() => {
    // Auto-trigger AI response if the session was just created with an initial prompt
    if (session.messages.length === 1 && session.messages[0].role === 'user' && !isStreamingRef.current) {
      const triggerInitialResponse = async () => {
        const aiMsgId = (Date.now() + 1).toString();
        const initialText = session.messages[0].content;

        const aiMsg: Message = {
          id: aiMsgId,
          role: 'assistant',
          content: '',
          type: 'text',
          blocks: []
        };

        const updatedMessages = [...session.messages, aiMsg];
        const updatedSession = {
          ...session,
          status: 'inprocess' as const,
          messages: updatedMessages
        };

        sessionRef.current = updatedSession;
        onUpdate(updatedSession);

        setIsStreaming(true);
        setStreamingMessageId(aiMsgId);
        streamingMessageIdRef.current = aiMsgId;
        isStreamingRef.current = true;

        if (isElectron()) {
          if (!backendSessionIdRef.current) {
            const sid = await backend.createSession(session.model);
            backendSessionIdRef.current = sid;
            setBackendSessionId(sid);
          }
          try {
            await backend.sendMessage(backendSessionIdRef.current, initialText);
          } catch (e) {
            setIsStreaming(false);
            setStreamingMessageId(null);
            streamingMessageIdRef.current = null;
            isStreamingRef.current = false;
            console.error('[initial send error]', e);
          }
        } else {
          const mockResponse = STRUCTURED_MOCK_RESPONSES[mockResponseIndex++ % STRUCTURED_MOCK_RESPONSES.length];
          await streamBlockResponse(aiMsgId, mockResponse.blocks);

          setIsStreaming(false);
          setStreamingMessageId(null);
          streamingMessageIdRef.current = null;
          isStreamingRef.current = false;
          onUpdate({
            ...sessionRef.current,
            status: 'review',
            diff: generateMockDiff()
          });
        }
      };

      triggerInitialResponse();
    }
  }, []); // Run on mount

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      type: 'text'
    };

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      type: 'text',
      blocks: []
    };

    const updatedMessages = [...sessionRef.current.messages, userMsg, aiMsg];
    const updatedSession = {
      ...sessionRef.current,
      status: 'inprocess' as const,
      messages: updatedMessages
    };

    sessionRef.current = updatedSession;
    onUpdate(updatedSession);

    const currentInput = inputValue;
    setInputValue('');
    setIsStreaming(true);
    setStreamingMessageId(aiMsgId);
    streamingMessageIdRef.current = aiMsgId;
    isStreamingRef.current = true;

    if (isElectron()) {
      // Create backend session if not already created
      if (!backendSessionIdRef.current) {
        const sid = await backend.createSession(session.model);
        backendSessionIdRef.current = sid;
        setBackendSessionId(sid);
      }
      // Send to backend — events will update UI via the useEffect listeners
      try {
        await backend.sendMessage(backendSessionIdRef.current, currentInput);
      } catch (e) {
        setIsStreaming(false);
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
        isStreamingRef.current = false;
        console.error('[send error]', e);
      }
    } else {
      // Mock fallback for browser dev
      const mockResponse = STRUCTURED_MOCK_RESPONSES[mockResponseIndex++ % STRUCTURED_MOCK_RESPONSES.length];
      await streamBlockResponse(aiMsgId, mockResponse.blocks);

      setIsStreaming(false);
      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;
      isStreamingRef.current = false;
      onUpdate({
        ...sessionRef.current,
        status: 'review',
        diff: generateMockDiff()
      });
    }
  };

  const streamBlockResponse = async (aiMsgId: string, blocks: ContentBlock[]) => {
    const builtBlocks: ContentBlock[] = [];

    for (const block of blocks) {
      if (!isStreamingRef.current) break;

      if (block.type === 'text') {
        // Stream text character by character
        let currentText = '';
        const blockIndex = builtBlocks.length;
        builtBlocks.push({ type: 'text', content: '' });

        for (const char of block.content) {
          if (!isStreamingRef.current) break;
          currentText += char;
          // Create new block object for each update so React detects the change
          builtBlocks[blockIndex] = { type: 'text', content: currentText };
          const newBlocks = [...builtBlocks];
          const updated = {
            ...sessionRef.current,
            messages: sessionRef.current.messages.map(m =>
              m.id === aiMsgId ? { ...m, content: currentText, blocks: newBlocks } : m
            )
          };
          sessionRef.current = updated;
          onUpdate(updated);
          await new Promise(r => setTimeout(r, 15));
        }
      } else {
        // Non-text blocks appear instantly
        builtBlocks.push(block);
        const newBlocks = [...builtBlocks];
        const updated = {
          ...sessionRef.current,
          messages: sessionRef.current.messages.map(m =>
            m.id === aiMsgId ? { ...m, blocks: newBlocks } : m
          )
        };
        sessionRef.current = updated;
        onUpdate(updated);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  };

  const handleStop = () => {
    isStreamingRef.current = false;
    setIsStreaming(false);
    setStreamingMessageId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTitleSave = () => {
    const newTitle = editTitle.trim();
    if (newTitle && newTitle !== session.title) {
      onUpdate({ ...session, title: newTitle });
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
  };

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(session.title);
    setIsEditingTitle(true);
  };

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  return (
    <div className={`flex flex-col overflow-hidden text-sm text-gray-200 ${
      fullScreen
        ? 'w-full h-full bg-transparent'
        : 'w-[600px] bg-[#3B3F4F]/90 backdrop-blur-3xl rounded-[32px] border border-white/10 shadow-2xl'
    }`}
    style={!fullScreen && height ? { height, transition: animateHeight ? 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : undefined } : undefined}
    >
      {/* Header */}
      <div className={`session-header flex items-center justify-between p-4 px-6 select-none ${fullScreen ? 'border-b border-white/5 bg-black/20' : 'cursor-move'}`} onDoubleClick={onHeaderDoubleClick}>
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <X size={16} className="text-gray-400" />
            </button>
          )}
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            isStreaming
              ? 'bg-yellow-400 animate-pulse'
              : session.status === 'review' || session.status === 'done'
                ? 'bg-green-400'
                : 'bg-gray-400'
          }`} />
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  handleTitleSave();
                } else if (e.key === 'Escape') {
                  handleTitleCancel();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              maxLength={100}
              className={`bg-transparent border-b border-white/30 outline-none font-medium text-white ${
                fullScreen ? 'text-lg' : 'text-sm max-w-[200px]'
              }`}
            />
          ) : (
            <div className="group/title flex items-center gap-1.5">
              <span
                onDoubleClick={handleTitleDoubleClick}
                className={`font-medium text-white truncate cursor-default ${
                  fullScreen ? 'text-lg' : 'text-sm max-w-[200px]'
                }`}
              >
                {session.title}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleTitleDoubleClick(e); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover/title:opacity-100 text-gray-400 hover:text-white transition-opacity"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-gray-400">
          <button className="hover:text-gray-200 transition-colors"><Clock size={18} /></button>
          <button className="hover:text-gray-200 transition-colors"><Plus size={20} /></button>
        </div>
      </div>

      {/* Content */}
      <div 
        ref={scrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${fullScreen ? 'p-8' : `p-6 pt-2${height ? '' : ' max-h-[600px]'}`}`}
      >
        <div className={`space-y-6 ${fullScreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
          {session.id === '1' ? (
            <ComplexMockContent />
          ) : (
            <div className="space-y-6">
              {session.messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`${
                    msg.role === 'user'
                      ? 'max-w-[85%] bg-white/10 text-gray-200 rounded-3xl px-5 py-3.5'
                      : 'text-gray-300 w-full'
                  }`}>
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
                        {msg.content}
                      </div>
                    ) : (
                      <MessageRenderer
                        blocks={msg.blocks}
                        fallbackContent={msg.content}
                        isStreaming={isStreaming && streamingMessageId === msg.id}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Input */}
      {!(height && height <= 110) && <div className={`p-4 pb-6 ${fullScreen ? 'w-full max-w-4xl mx-auto' : 'px-6'}`}>
        <div className={`bg-[#A07841]/30 backdrop-blur-xl rounded-[24px] p-2 flex flex-col gap-2 border border-white/10 shadow-xl focus-within:border-white/20 focus-within:ring-4 focus-within:ring-white/5 transition-all`}>
          <textarea 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="随便问..." 
            rows={1}
            className="bg-transparent border-none outline-none px-4 py-3 text-white placeholder-gray-400 w-full resize-none min-h-[44px] max-h-[200px]"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
            }}
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-colors">
                <Plus size={16} />
              </button>
              <button className="bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-white/5">
                Claude Opus 4.6
              </button>
              
              {/* Review Button */}
              {session.status === 'review' && session.diff && (session.diff.totalAdditions > 0 || session.diff.totalDeletions > 0) && (
                <button
                  onClick={onOpenReview}
                  className="flex items-center gap-1 bg-white/[0.06] hover:bg-white/10 px-2 py-1 rounded-lg text-[11px] font-mono transition-colors border border-white/[0.06]"
                >
                  <span className="text-green-400">+{session.diff.totalAdditions}</span>
                  <span className="text-red-400">-{session.diff.totalDeletions}</span>
                </button>
              )}
            </div>
            {isStreaming ? (
              <button 
                onClick={handleStop}
                className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 transition-colors"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button 
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-500 flex items-center justify-center transition-colors border border-white/5"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>}
    </div>
  );
}

function ComplexMockContent() {
  return (
    <div className="space-y-6 text-[15px] text-gray-300 leading-relaxed">
      {/* Previous AI Message Part */}
      <div className="space-y-4">
        <h3 className="text-white font-medium text-base">Project Setup Complete</h3>
        <p>I've initialized the project with the following structure:</p>
        <ul className="space-y-1.5 list-disc list-inside marker:text-gray-500">
          <li><span className="text-gray-400">Framework:</span> React 18 with TypeScript</li>
          <li><span className="text-gray-400">Styling:</span> Tailwind CSS v4 with custom theme</li>
          <li><span className="text-gray-400">Build tool:</span> Vite for blazing fast HMR</li>
        </ul>
        <div className="border-l-2 border-white/10 pl-4 py-1 text-gray-400 italic text-sm">
          Configuration follows best practices for production builds with tree-shaking and code splitting.
        </div>
        <p>Here's the main entry point:</p>

        <div className="bg-[#2B2D3A] rounded-xl overflow-hidden border border-white/5">
          <div className="flex items-center justify-between px-4 py-2 bg-black/20 border-b border-white/5 text-xs text-gray-400">
            <span>TSX</span>
            <button className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">
              <Copy size={12} />
              <span>Copy</span>
            </button>
          </div>
          <div className="p-4 font-mono text-sm text-gray-300 overflow-x-auto">
            <pre><code><span className="text-blue-400">import</span> <span className="text-blue-200">React</span> <span className="text-blue-400">from</span> <span className="text-green-300">'react'</span>;
<span className="text-blue-400">import</span> {'{'} <span className="text-blue-200">createRoot</span> {'}'} <span className="text-blue-400">from</span> <span className="text-green-300">'react-dom/client'</span>;
<span className="text-blue-400">import</span> <span className="text-blue-200">App</span> <span className="text-blue-400">from</span> <span className="text-green-300">'./App'</span>;
<span className="text-blue-400">import</span> <span className="text-green-300">'./styles/globals.css'</span>;

<span className="text-blue-400">const</span> <span className="text-blue-200">root</span> = <span className="text-yellow-200">createRoot</span>(document.<span className="text-yellow-200">getElementById</span>(<span className="text-green-300">'root'</span>)!);
root.<span className="text-yellow-200">render</span>(
  &lt;<span className="text-blue-300">React.StrictMode</span>&gt;
    &lt;<span className="text-blue-300">App</span> /&gt;
  &lt;/<span className="text-blue-300">React.StrictMode</span>&gt;
);</code></pre>
          </div>
        </div>
        <p>
          The <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">tsconfig.json</code> has been configured with strict mode and path aliases for cleaner imports.
        </p>
        <div className="flex items-center gap-3 text-gray-500 pt-1">
          <button className="hover:text-gray-300 transition-colors"><Copy size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsUp size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsDown size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button className="bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-full text-sm transition-colors">Add testing setup</button>
          <button className="bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-full text-sm transition-colors">Configure CI/CD</button>
          <button className="bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-full text-sm transition-colors">Add ESLint rules</button>
        </div>
      </div>

      {/* User Message */}
      <div className="flex justify-end pt-4">
        <div className="bg-white/10 text-gray-200 rounded-3xl px-5 py-3.5 max-w-[85%]">
          帮我重构用户认证模块，加上单元测试
        </div>
      </div>

      {/* AI Response with Tool Calls */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-gray-500 border-t-transparent animate-spin"></div>
          <span>Thinking for 5s</span>
        </div>

        <div className="space-y-2.5 font-mono text-sm">
          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-purple-400 font-medium">glob</span>
              <span className="text-gray-400">src/auth/**/*.{"{ts,tsx}"}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.3s</span>
              <span className="text-xs">&gt;</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-blue-400 font-medium">read</span>
              <span className="text-gray-400">src/auth/AuthProvider.tsx</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.1s</span>
              <span className="text-xs">&gt;</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-green-400 font-medium">bash</span>
              <span className="text-gray-400">npm test -- --coverage src/auth/</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>3.2s</span>
              <span className="text-xs">&gt;</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-orange-400 font-medium">write</span>
              <span className="text-gray-400">src/auth/AuthProvider.tsx — refactored with useReducer</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.2s</span>
            </div>
          </div>

          <div className="flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-orange-400 font-medium">write</span>
              <span className="text-gray-400">src/auth/__tests__/auth.test.ts — added 6 new tests</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>0.1s</span>
            </div>
          </div>
        </div>

        <div className="pt-4 space-y-4">
          <p>Refactored the auth module. Key changes:</p>
          <ol className="list-decimal list-inside space-y-2.5 text-gray-300 marker:text-gray-500">
            <li>Replaced <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">useState</code> with <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">useReducer</code> for cleaner state transitions</li>
            <li>Extracted token management into <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm">tokenService.ts</code></li>
            <li>Added <strong>6 new unit tests</strong> covering edge cases</li>
            <li>Test coverage improved from <em className="text-gray-400">72%</em> to <em className="text-gray-400">94.3%</em></li>
          </ol>
        </div>

        <div className="flex items-center gap-3 text-gray-500 pt-2">
          <button className="hover:text-gray-300 transition-colors"><Copy size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsUp size={16} /></button>
          <button className="hover:text-gray-300 transition-colors"><ThumbsDown size={16} /></button>
        </div>
      </div>
    </div>
  );
}
