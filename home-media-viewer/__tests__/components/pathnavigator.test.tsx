import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import PathNavigator from "@/components/content/pathNavigator";

describe('PathNavigator', () => {
    it('Render Path navigator with 3 parts', () => {
      const path = [ 'dir1', 'dir2', 'dir3' ];

      render(<PathNavigator path={path.join('/')} />);

      // screen.debug()

      const rootLink = screen.getByText('/');
      // expect(rootLink).toBeInTheDocument();
   
      path.forEach(p => {
        const dir1link = screen.getByText(`/${p}`);
        // expect(dir1link).toBeInTheDocument();
      });
    })
  })