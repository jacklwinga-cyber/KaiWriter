import type { LexicalEditor } from 'lexical';
import { $createTextNode, $getRoot, $isParagraphNode } from 'lexical';
import { $createImageNode } from '../components/editor/nodes/ImageNode';
import { extractBracketTokens } from './mergeFields';
import { getPlainTextFromEditor } from './plainTextMap';

export interface TemplateAssistImage {
  placeholder: string;
  src: string;
  alt: string;
  frameIndex?: number;
}

export interface TemplateAssistResult {
  replacements: Record<string, string>;
  images: TemplateAssistImage[];
  frames?: Array<{ shot: string; action: string; dialogue: string }>;
  summary: string;
}

function storyboardImageUrl(brief: string, frameLabel: string, index: number): string {
  const prompt = encodeURIComponent(
    `storyboard sketch ${frameLabel}, ${brief}, cinematic pencil storyboard frame ${index + 1}, professional`,
  );
  return `https://image.pollinations.ai/prompt/${prompt}?width=640&height=360&nologo=true`;
}

function localAssistFallback(
  templateId: string | undefined,
  brief: string,
  plainText: string,
): TemplateAssistResult {
  const title = brief.trim() || 'Untitled Project';
  const replacements: Record<string, string> = {
    '[Project Title]': title,
    '[video, animation, or campaign name]': brief.trim() || 'Campaign video',
    '[Project Name]': title,
    '[Client Name]': 'Client Name',
    '[Your Name]': 'Your Name',
    '[Your Company]': 'Your Company',
    '[Date]': new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
  };

  const isStoryboard = templateId === 'storyboard' || plainText.toLowerCase().includes('storyboard');
  const images: TemplateAssistImage[] = [];
  const frames = isStoryboard
    ? [
        {
          shot: 'Wide',
          action: `Opening scene — ${brief || 'establish the setting and subject'}`,
          dialogue: 'Voiceover introduces the story.',
        },
        {
          shot: 'Close-up',
          action: `Key detail or product moment — ${brief || 'highlight the main message'}`,
          dialogue: 'Supporting narration builds interest.',
        },
        {
          shot: 'Medium',
          action: `Resolution or call-to-action — ${brief || 'close with next steps'}`,
          dialogue: 'Final voiceover and brand sign-off.',
        },
      ]
    : undefined;

  if (isStoryboard) {
    frames!.forEach((_, index) => {
      images.push({
        placeholder: '[Insert sketch or image placeholder]',
        src: storyboardImageUrl(brief, `Frame ${index + 1}`, index),
        alt: `Frame ${index + 1} — ${brief || 'Storyboard'}`,
        frameIndex: index,
      });
    });
  }

  for (const token of extractBracketTokens(plainText)) {
    if (replacements[token]) continue;
    if (token.includes('Date')) replacements[token] = replacements['[Date]'];
    else if (token.includes('Your') && token.includes('Name')) replacements[token] = 'Your Name';
    else if (token.includes('Email')) replacements[token] = 'you@example.com';
    else if (token.includes('Company') || token.includes('Business')) replacements[token] = 'Your Company';
  }

  return {
    replacements,
    images,
    frames,
    summary: isStoryboard
      ? 'Filled storyboard frames with shot notes and generated preview images.'
      : 'Filled common placeholders from your brief.',
  };
}

export async function requestTemplateAssist(options: {
  templateId?: string;
  brief: string;
  plainText: string;
  accessToken?: string | null;
}): Promise<TemplateAssistResult> {
  const { templateId, brief, plainText, accessToken } = options;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  if (supabaseUrl && accessToken && brief.trim()) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/template-assist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({ templateId, brief, text: plainText }),
      });
      if (response.ok) {
        const payload = await response.json() as TemplateAssistResult;
        if (payload.replacements) return payload;
      }
    } catch {
      // fall through
    }
  }

  return localAssistFallback(templateId, brief, plainText);
}

function replaceInAllTextNodes(from: string, to: string) {
  if (!from || to === undefined) return;
  for (const node of $getRoot().getAllTextNodes()) {
    const text = node.getTextContent();
    if (text.includes(from)) {
      node.setTextContent(text.split(from).join(to));
    }
  }
}

export function applyTemplateAssistToEditor(editor: LexicalEditor, result: TemplateAssistResult): void {
  editor.update(() => {
    for (const [from, to] of Object.entries(result.replacements)) {
      if (from === '[Insert sketch or image placeholder]') continue;
      replaceInAllTextNodes(from, to);
    }

    if (result.images.length === 0) return;

    let frameIndex = 0;
    for (const child of $getRoot().getChildren()) {
      if (!$isParagraphNode(child)) continue;
      const text = child.getTextContent();
      if (!text.includes('[Insert sketch or image placeholder]')) continue;

      const image = result.images[frameIndex] ?? result.images[result.images.length - 1];
      const frame = result.frames?.[frameIndex];
      frameIndex += 1;

      let body = text.replace('[Insert sketch or image placeholder]', '').trim();
      if (frame) {
        body = body
          .replace('[Wide / Medium / Close-up]', frame.shot)
          .replace('[What happens in this frame]', frame.action)
          .replace('[Optional audio]', frame.dialogue)
          .replace('[…]', frame.shot);
      }

      child.clear();
      child.append(
        $createImageNode({
          src: image.src,
          altText: image.alt,
          maxWidth: 520,
          width: 520,
          height: 292,
        }),
      );

      if (body) {
        child.append($createTextNode(`\n${body}`));
      }
    }
  });
}

export function countPlaceholdersInEditor(editor: LexicalEditor): number {
  const text = getPlainTextFromEditor(editor);
  return extractBracketTokens(text).length;
}
