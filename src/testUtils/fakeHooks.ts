import React from 'react';

/**
 * The project's test stack has no DOM environment and no
 * `@testing-library/*` (see PLAN-ALL-SHOTS.md §4.4 and
 * `targetCanvasReadOnly.test.tsx`), so stateful screen components cannot be
 * mounted and driven through real events/effects. This helper calls a
 * function component directly under a hand-rolled hooks dispatcher so a
 * specific `useState` slice (by call order) can be forced to a chosen value
 * without ever running the component's effects (which would otherwise touch
 * IndexedDB). The returned value is a plain React element tree — nested
 * child components have *not* been invoked yet (JSX only builds element
 * descriptors), so passing it to `renderToStaticMarkup` afterwards renders
 * children through React's real dispatcher, same as any other component
 * test in this project.
 */
const ReactInternals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } };
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

export function renderFunctionComponentToElement<P>(
  Component: (props: P) => React.ReactElement | null,
  props: P,
  stateOverridesByIndex: Record<number, unknown> = {},
): React.ReactElement | null {
  let stateIndex = 0;
  const fakeDispatcher = {
    useState: (initial: unknown) => {
      const idx = stateIndex;
      stateIndex += 1;
      if (Object.prototype.hasOwnProperty.call(stateOverridesByIndex, idx)) {
        return [stateOverridesByIndex[idx], () => {}];
      }
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [value, () => {}];
    },
    useEffect: () => {},
    useLayoutEffect: () => {},
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useRef: (initial: unknown) => ({ current: initial }),
  };
  const prevDispatcher = ReactInternals.ReactCurrentDispatcher.current;
  ReactInternals.ReactCurrentDispatcher.current = fakeDispatcher;
  try {
    return Component(props);
  } finally {
    ReactInternals.ReactCurrentDispatcher.current = prevDispatcher;
  }
}

/**
 * Recursively finds all React elements of a given component type within an
 * already-built element tree (before it has been rendered — i.e. children of
 * host elements are found via `props.children`, not by executing function
 * components).
 */
export function findElementsByType(
  node: unknown,
  type: unknown,
  found: React.ReactElement[] = [],
): React.ReactElement[] {
  if (node === null || node === undefined || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const child of node) findElementsByType(child, type, found);
    return found;
  }
  const element = node as React.ReactElement;
  if (element.type === type) found.push(element);
  const children = (element.props as { children?: unknown } | undefined)?.children;
  if (children !== undefined) findElementsByType(children, type, found);
  return found;
}
