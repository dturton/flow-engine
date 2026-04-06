/**
 * CodeMirror-based JavaScript code editor component.
 * Wraps CodeMirror 6 with the oneDark theme, JavaScript syntax highlighting,
 * and controlled-value syncing so it behaves like a React controlled input.
 */

import { useRef, useEffect } from 'react';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string;
  readOnly?: boolean;
}

/** Renders a CodeMirror editor with JS highlighting, optional read-only mode, and external value sync */
export default function CodeEditor({ value, onChange, placeholder, height = '120px', readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      basicSetup,
      javascript(),
      oneDark,
      EditorView.theme({
        '&': { height, fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { padding: '8px 0' },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    if (placeholder) {
      extensions.push(placeholderExt(placeholder));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create the editor once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. reset)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden border border-gray-600"
    />
  );
}
