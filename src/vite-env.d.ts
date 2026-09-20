/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare module '*?url&no-inline' { const url: string; export default url; }

declare module 'mammoth/mammoth.browser' {
  interface MammothResult { value: string; messages: Array<{ type: string; message: string }> }
  const mammoth: { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult> };
  export default mammoth;
}
