import { HomeRibbon } from './ribbon/HomeRibbon';
import { InsertRibbon } from './ribbon/InsertRibbon';
import { LayoutRibbon } from './ribbon/LayoutRibbon';
import { ReviewRibbon } from './ribbon/ReviewRibbon';
import { ViewRibbon } from './ribbon/ViewRibbon';

export interface ToolbarPluginProps {
  activeTab?: string;
  pageSize?: string;
  setPageSize?: (s: string) => void;
  orientation?: string;
  setOrientation?: (s: string) => void;
  margins?: string;
  setMargins?: (s: string) => void;
  onOpenStyles?: () => void;
  onOpenNavigation?: () => void;
  onOpenComments?: () => void;
  onOpenProofread?: () => void;
  onOpenWritingSuggestions?: () => void;
  onOpenKaiAssist?: () => void;
  onOpenBranding?: () => void;
  isPro?: boolean;
  onRequestUpgrade?: () => void;
  isFocusMode?: boolean;
  onToggleFocus?: () => void;
}

export function ToolbarPlugin({
  activeTab = 'Home',
  pageSize = 'Letter',
  setPageSize = () => {},
  orientation = 'Portrait',
  setOrientation = () => {},
  margins = 'Normal',
  setMargins = () => {},
  onOpenStyles,
  onOpenNavigation,
  onOpenComments,
  onOpenProofread,
  onOpenWritingSuggestions,
  onOpenKaiAssist,
  onOpenBranding,
  isPro,
  onRequestUpgrade,
  isFocusMode,
  onToggleFocus,
}: ToolbarPluginProps) {
  switch (activeTab) {
    case 'Insert':
      return <InsertRibbon />;
    case 'Layout':
      return (
        <LayoutRibbon
          pageSize={pageSize}
          setPageSize={setPageSize}
          orientation={orientation}
          setOrientation={setOrientation}
          margins={margins}
          setMargins={setMargins}
          onOpenBranding={onOpenBranding}
          isPro={isPro}
          onRequestUpgrade={onRequestUpgrade}
        />
      );
    case 'Review':
      return (
        <ReviewRibbon
          onProofread={onOpenProofread}
          onWritingSuggestions={onOpenWritingSuggestions}
          onKaiAssist={onOpenKaiAssist}
        />
      );
    case 'View':
      return (
        <ViewRibbon
          onOpenNavigation={onOpenNavigation}
          onOpenComments={onOpenComments}
          onOpenProofread={onOpenProofread}
          isFocusMode={isFocusMode}
          onToggleFocus={onToggleFocus}
        />
      );
    case 'Home':
    default:
      return <HomeRibbon onOpenStyles={onOpenStyles} />;
  }
}
