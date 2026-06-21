import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QtyStepper } from './QtyStepper';

/**
 * F8: at min/max the bound button must stay keyboard-focusable (aria-disabled,
 * not `disabled`) and act as a no-op, so focus is never dropped mid-interaction.
 */
describe('QtyStepper (F8)', () => {
  it('keeps the at-bound button focusable and no-ops the action', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<QtyStepper qty={1} min={1} max={5} onChange={onChange} />);

    const dec = screen.getByRole('button', { name: /decrease/i });
    // aria-disabled, never the real `disabled` attribute (which would drop focus).
    expect(dec).toHaveAttribute('aria-disabled', 'true');
    expect(dec).not.toBeDisabled();

    dec.focus();
    expect(dec).toHaveFocus();
    await user.click(dec);

    expect(onChange).not.toHaveBeenCalled();
    expect(dec).toHaveFocus(); // focus retained at the bound
  });

  it('increments when within bounds', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<QtyStepper qty={2} min={1} max={5} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /increase/i }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
