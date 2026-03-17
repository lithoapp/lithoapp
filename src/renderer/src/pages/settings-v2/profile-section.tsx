import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateName, validateOptionalEmail } from '../../../../shared/user-profile-validation';

export function ProfileSection(): React.JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [original, setOriginal] = useState({ name: '', email: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isNameTouched, setIsNameTouched] = useState(false);
  const [isEmailTouched, setIsEmailTouched] = useState(false);

  useEffect(() => {
    window.litho.preferences
      .getUserProfile()
      .then((profile) => {
        const n = profile.name ?? '';
        const e = profile.email ?? '';
        setName(n);
        setEmail(e);
        setOriginal({ name: n, email: e });
      })
      .catch(() => toast.error('Failed to load profile'));
  }, []);

  const nameError = validateName(name);
  const emailError = validateOptionalEmail(email);
  const hasChanged = name !== original.name || email !== original.email;
  const canSave = !nameError && !emailError && hasChanged;

  async function handleSave(): Promise<void> {
    setIsNameTouched(true);
    setIsEmailTouched(true);
    if (nameError || emailError) return;

    setIsSaving(true);
    try {
      await window.litho.preferences.setUserProfile(name.trim(), email.trim());
      setOriginal({ name: name.trim(), email: email.trim() });
      toast.success('Profile saved');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">Your name and contact details.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Input
          className="h-11 text-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setIsNameTouched(true)}
          placeholder="Your name"
          aria-invalid={isNameTouched && !!nameError}
        />
        {isNameTouched && nameError && (
          <p className="-mt-2 text-sm text-destructive">{nameError}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <Input
            className="h-11 text-base"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setIsEmailTouched(true)}
            placeholder="you@example.com"
            aria-invalid={isEmailTouched && !!emailError}
          />
          {isEmailTouched && emailError && <p className="text-sm text-destructive">{emailError}</p>}
          <p className="text-sm text-muted-foreground">Used for crash reports and feedback only.</p>
        </div>

        <Button
          className="h-10 w-fit px-6 text-sm"
          onClick={handleSave}
          disabled={!canSave || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
