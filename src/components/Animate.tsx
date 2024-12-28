import type { ClassAttributes, JSX } from 'preact';
import type { InputHTMLAttributes, PropsWithChildren } from 'preact/compat';
import { createElement, useEffect, useRef, useState } from 'preact/compat';

export type Properties = {
  active: boolean
  afterEnterClass?: string
  afterLeaveClass?: string
  beforeEnterClass?: string
  beforeLeaveClass?: string
  enterAnimationClass?: string
  leaveAnimationClass?: string
  onTransitionEnd?: () => void
  tagName?: keyof JSX.IntrinsicElements
  type: 'animation' | 'transition'
} & JSX.IntrinsicElements[keyof JSX.IntrinsicElements];

export default function Animate({
  active,
  afterEnterClass,
  afterLeaveClass,
  beforeEnterClass,
  beforeLeaveClass,
  children,
  class: className,
  enterAnimationClass,
  leaveAnimationClass,
  onTransitionEnd,
  tagName = 'div',
  type,
  ...attrs
}: PropsWithChildren<Properties>) {
  const ref = useRef<HTMLElement>(null),
    tag = (tagName as string).toLowerCase(),
    [extendedClassName, setExtendedClassName] = useState<Array<string | undefined>>(active ? [afterEnterClass] : [afterLeaveClass]),
    [isActive, setIsActive] = useState(active);

  useEffect(() => {
    if (isActive === active || ref.current == null) {
      return;
    }
    function onEnd() {
      if (ref.current) {
        ref.current.removeEventListener(`${type}end`, onEnd);
        ref.current.removeEventListener(`${type}cancel`, onEnd);
        setExtendedClassName([active ? afterEnterClass : afterLeaveClass]);
      }
      onTransitionEnd?.();
    }
    if (active) {
      queueMicrotask(() => {
        if (ref.current) {
          ref.current.addEventListener(`${type}end`, onEnd);
          ref.current.addEventListener(`${type}cancel`, onEnd);
        }
        if (type === 'transition') {
          setExtendedClassName([beforeEnterClass]);
          requestAnimationFrame(() => {
            setExtendedClassName([enterAnimationClass]);
          });
        } else {
          setExtendedClassName([enterAnimationClass]);
        }
      });
    } else {
      queueMicrotask(() => {
        if (ref.current) {
          ref.current.addEventListener(`${type}end`, onEnd);
          ref.current.addEventListener(`${type}cancel`, onEnd);
        }
        if (type === 'transition') {
          setExtendedClassName([beforeLeaveClass]);
          requestAnimationFrame(() => {
            setExtendedClassName([leaveAnimationClass]);
          });
        } else {
          setExtendedClassName([leaveAnimationClass]);
        }
      });
    }
    setIsActive(active);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, active, beforeEnterClass, type, beforeLeaveClass, onTransitionEnd, afterEnterClass, afterLeaveClass, leaveAnimationClass]);

  return createElement(tag, {
    className: `${className?.toString()} ${extendedClassName.filter(Boolean).join(' ')}`,
    ...attrs,
    ref
  } as ClassAttributes<HTMLInputElement> & InputHTMLAttributes<HTMLInputElement>, children);
}
