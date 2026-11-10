declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.md?raw' {
  const text: string;
  export default text;
}
