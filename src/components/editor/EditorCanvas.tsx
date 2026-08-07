import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { ImagesPlugin } from './plugins/ImagesPlugin';
import { ParagraphFormatPlugin } from './plugins/ParagraphFormatPlugin';

import styles from './Editor.module.css';

function Placeholder() {
  return <div className={styles.placeholder}>Start typing...</div>;
}

export function EditorCanvas() {
  return (
    <div className={styles.editorContainer}>
      <div className={styles.editorInner}>
        <RichTextPlugin
          contentEditable={<ContentEditable className={styles.editorInput} />}
          placeholder={<Placeholder />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <AutoFocusPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <LinkPlugin />
        <TablePlugin />
        <ImagesPlugin />
        <ParagraphFormatPlugin />
      </div>
    </div>
  );
}
