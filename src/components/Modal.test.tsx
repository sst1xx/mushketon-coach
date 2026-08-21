import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Modal from './Modal';

describe('Modal (renderToStaticMarkup structure)', () => {
  it('renders nothing when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      <Modal isOpen={false} onClose={() => {}}>content</Modal>
    );
    expect(markup).toBe('');
  });

  it('renders dialog role and aria-modal when open', () => {
    const markup = renderToStaticMarkup(
      <Modal isOpen={true} onClose={() => {}}>content</Modal>
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
  });

  it('renders title with aria-labelledby pointing to the title element id', () => {
    const markup = renderToStaticMarkup(
      <Modal isOpen={true} title="Заголовок" onClose={() => {}}>content</Modal>
    );
    const labelledByMatch = markup.match(/aria-labelledby="([^"]+)"/);
    expect(labelledByMatch).not.toBeNull();
    const id = labelledByMatch![1];
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain('Заголовок');
  });

  it('falls back to the content element for aria-labelledby when no title is provided (always has an accessible name)', () => {
    const markup = renderToStaticMarkup(
      <Modal isOpen={true} onClose={() => {}}>content</Modal>
    );
    const labelledByMatch = markup.match(/aria-labelledby="([^"]+)"/);
    expect(labelledByMatch).not.toBeNull();
    const id = labelledByMatch![1];
    expect(markup).toContain(`id="${id}"`);
  });

  it('renders aria-describedby pointing to the content wrapper', () => {
    const markup = renderToStaticMarkup(
      <Modal isOpen={true} title="Заголовок" onClose={() => {}}>content</Modal>
    );
    const describedByMatch = markup.match(/aria-describedby="([^"]+)"/);
    expect(describedByMatch).not.toBeNull();
    const id = describedByMatch![1];
    expect(markup).toContain(`id="${id}"`);
  });

  it('renders children content', () => {
    const markup = renderToStaticMarkup(
      <Modal isOpen={true} onClose={() => {}}><p>Hello world</p></Modal>
    );
    expect(markup).toContain('Hello world');
  });

  it('renders action buttons with labels', () => {
    const markup = renderToStaticMarkup(
      <Modal
        isOpen={true}
        onClose={() => {}}
        actions={[
          { label: 'Отмена', onClick: () => {} },
          { label: 'Удалить', onClick: () => {}, danger: true },
        ]}
      >
        content
      </Modal>
    );
    expect(markup).toContain('Отмена');
    expect(markup).toContain('Удалить');
  });

  it('respects disabled action state', () => {
    const markup = renderToStaticMarkup(
      <Modal
        isOpen={true}
        onClose={() => {}}
        actions={[{ label: 'Сохранить', onClick: () => {}, disabled: true }]}
      >
        content
      </Modal>
    );
    expect(markup).toContain('disabled');
  });
});
