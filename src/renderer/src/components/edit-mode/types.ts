export interface TextChange {
  type: 'text';
  id: string;
  pageId: string;
  pageName: string;
  loc: string;
  oldText: string;
  newText: string;
}

export interface ChangeRequest {
  type: 'request';
  id: string;
  pageId: string;
  pageName: string;
  loc: string;
  elementInfo: {
    tagName: string;
    classes: string;
    textContent: string;
    outerHtml: string;
  };
  description: string;
}

export type PendingChange = TextChange | ChangeRequest;
