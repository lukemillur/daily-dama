/**
 * The single module app code dynamically imports to reach trick-viz.
 *
 * Every `import()` of 3D code must target this one module. When two dynamic
 * imports point at different modules that share dependencies, Metro's web
 * export hoists the shared code (three, fiber, troika) into a `__common`
 * chunk that loads eagerly with the entry bundle, undoing the split.
 */
export { LoopingHeroScene } from './LoopingHeroScene';
export { TrickVizSandboxScreen } from './TrickVizSandboxScreen';
