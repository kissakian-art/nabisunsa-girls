/**
 * CSS modules have no types of their own.
 *
 * The web build imports `*.module.css` for class names; without this
 * declaration TypeScript reports the import as a missing module and the one
 * genuine error in the project is buried under it.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
