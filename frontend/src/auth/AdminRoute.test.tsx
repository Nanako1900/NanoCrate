import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { AdminRoute } from './AdminRoute';

function renderGuarded() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AdminRoute>
          <h1>Secret admin content</h1>
        </AdminRoute>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AdminRoute RBAC', () => {
  it('blocks anonymous visitors with a sign-in gate', () => {
    renderGuarded();
    expect(screen.getByRole('heading', { name: '登录管理后台' })).toBeInTheDocument();
    expect(screen.queryByText('Secret admin content')).toBeNull();
  });

  it('admins reach the content after signing in', async () => {
    const user = userEvent.setup();
    renderGuarded();
    await user.click(screen.getByRole('button', { name: /以管理员登录/ }));
    expect(screen.getByRole('heading', { name: 'Secret admin content' })).toBeInTheDocument();
  });
});
