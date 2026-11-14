import React from 'react';
// The project does not yet include @types/react-dom; keep this web adapter typed.
const { createPortal } = require('react-dom') as {
  createPortal(children: React.ReactNode, container: Element): React.ReactPortal;
};
export default function HoverLayer({ children }: { children: React.ReactNode }) {
  return typeof document === 'undefined' ? null : createPortal(children, document.body);
}
