import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import PathNavigator from "@/components/content/pathNavigator";

describe('PathNavigator', () => {
    it('Render Path navigator with 3 part path', () => {
      const path = [ 'dir1', 'dir2', 'dir3' ];

      render(<PathNavigator path={path.join('/')} />);

      expect(screen.getByText('/')).toHaveAttribute('href', '/browse' );

      expect(screen.getByText('/dir1')).toHaveAttribute('href', '/browse/dir1');
      expect(screen.getByText('/dir2')).toHaveAttribute('href', '/browse/dir1/dir2');
      expect(screen.getByText('/dir3')).toHaveAttribute('href', '/browse/dir1/dir2/dir3');
    })

    it('Render Path navigator with empty path', () => {
      render(<PathNavigator path="" />);

      const anchorElements = document.querySelectorAll('a');
      // no links rendered
      expect(anchorElements.length).toEqual(0);
    })
  })