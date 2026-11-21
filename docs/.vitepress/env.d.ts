declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// The docs config runs in Node, but the repository carries no @types/node: declare what it uses.
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare const process: { env: Record<string, string | undefined> };
