import type { JSX as ReactJSX } from 'react'

// React 19 no longer declares a global JSX namespace, but the classic runtime with
// a custom factory (`h`) still resolves element types through it.
declare global {
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute
    type ElementClass = ReactJSX.ElementClass
    type ElementType = ReactJSX.ElementType
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>
    type IntrinsicElements = ReactJSX.IntrinsicElements
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>
  }
}
