import '@testing-library/jest-dom';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Modal from '@/components/layout/modal';
import ContentDisplay from '@/components/content/contentDisplay';
import type { FileResultType } from '@/types/api/fileTypes';

it('labels its dialog, closes with Escape, and restores focus to the opener', async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open details</button>
        {open && (
          <Modal title="Photo details" onClose={() => setOpen(false)}>
            <button>Inside</button>
          </Modal>
        )}
      </>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open details' });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.getByRole('dialog', { name: 'Photo details' })).toContainElement(document.activeElement as HTMLElement);
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});
it('supports viewer arrow navigation without taking keys from native video controls', () => {
  const next = jest.fn();
  const previous = jest.fn();
  const file = { id: 'video', name: 'Clip', extension: 'mp4' } as FileResultType;
  render(<ContentDisplay content={file} nextHandler={next} previousHandler={previous} />);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
  expect(next).toHaveBeenCalledTimes(1);
  expect(previous).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.querySelector('video')!, { key: 'ArrowRight' });
  expect(next).toHaveBeenCalledTimes(1);
});
