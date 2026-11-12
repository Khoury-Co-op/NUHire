declare module 'react-pdf-highlighter' {
  import { Component, ReactNode } from 'react';
  import { PDFDocumentProxy } from 'pdfjs-dist';

  export interface ScaledPosition {
    boundingRect: {
      left: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width: number;
      height: number;
    };
    rects: Array<{ x1: number; y1: number; x2: number; y2: number; width: number; height: number }>;
    pageNumber: number;
  }

  declare type LTWHP = {
    left: number;
    top: number;
    width: number;
    height: number;
    pageNumber: number;
  };

  declare type LTWH = {
    left: number;
    top: number;
    width: number;
    height: number;
  };

  export interface Content {
    text?: string;
    image?: string;
  }

  export interface NewHighlight {
    position: ScaledPosition;
    content: Content;
    comment?: { text: string; emoji: string };
  }

  export interface IHighlight extends NewHighlight {
    id: string;
  }

  export class PdfLoader extends Component<{
    url: string;
    beforeLoad?: ReactNode;
    children: (pdfDocument: PDFDocumentProxy) => ReactNode;
  }> {}

  export class PdfHighlighter extends Component<{
    pdfDocument: PDFDocumentProxy;
    highlights: IHighlight[];
    onSelectionFinished: (position: ScaledPosition, content: Content) => void;
    highlightTransform: (
      highlight: IHighlight,
      index: number,
      setTip: (highlight: IHighlight, callback: () => JSX.Element) => void,
      hideTip: () => void
    ) => ReactNode;
  }> {}

  export class Highlight extends Component<{ highlight: IHighlight }> {}

  export class AreaHighlight extends Component<{
    highlight: IHighlight;
    onMouseOver?: (highlight: IHighlight) => void;
    onMouseOut?: () => void;
  }> {}

  export class Popup extends Component<{ popupContent: ReactNode; children: ReactNode }> {}

  export class Tip extends Component {}
}
