import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useContainer } from '@/app/di'
import { credentialsSchema } from '@/modules/auth/domain/session'
import { LoginShowcase } from '@/modules/auth/ui/LoginShowcase'
import { BRANDS, BrandMark, useBrand } from '@/ui/components/brand'
import { Button } from '@/ui/components/shadcn/button'
import { Input } from '@/ui/components/shadcn/input'
import { Label } from '@/ui/components/shadcn/label'
import { cn } from '@/ui/lib/utils'

type FieldErrors = Partial<Record<'username' | 'password' | 'form', string>>

/** Usuarios de prueba solo en desarrollo (o si el build lo pide): nunca en producción. */
const DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_USERS === 'true'

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { auth } = useContainer()
  const { brand } = useBrand()
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const parsed = credentialsSchema.safeParse({
      username: form.get('username'),
      password: form.get('password'),
      remember: form.get('remember') === 'on',
    })
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors
      setErrors({ username: flat.username?.[0], password: flat.password?.[0] })
      setShakeKey((k) => k + 1)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await auth.login(parsed.data)
      onLoggedIn()
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'No se pudo iniciar sesión.' })
      setShakeKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  const fieldCls = (bad?: string) =>
    cn(
      'h-[50px] rounded-xl border-[1.5px] bg-white px-11 text-[15px] focus-visible:ring-4 focus-visible:ring-primary-ring',
      bad && 'border-destructive',
    )

  return (
    <div className="grid min-h-dvh bg-background dsk:grid-cols-[1.1fr_1fr]">
      <LoginShowcase />
      <div className="flex items-start justify-center px-5 pt-24 pb-8 dsk:items-center dsk:pt-8">
        <form
          key={shakeKey}
          onSubmit={submit}
          noValidate
          aria-label="Inicio de sesión"
          className={cn(
            'w-full max-w-[400px] animate-rise rounded-3xl bg-card px-6 pt-7 pb-[22px] text-center shadow-sheet',
            shakeKey > 0 && 'animate-shake',
          )}
        >
          <div className={brand === 'rocio' ? '-mt-[70px] mb-1.5' : '-mt-[82px] mb-1.5'}>
            <BrandMark size={112} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-[-0.04em]">{BRANDS[brand].name}</h1>
          <div className="mt-1 text-[19px] font-extrabold text-primary">Planificación de Demanda</div>
          <p className="mt-1.5 mb-5 text-ink-2">{BRANDS[brand].tag}</p>

          <div className="relative mb-3 text-left">
            <User className="absolute top-[15px] left-3.5 size-5 text-muted-foreground" />
            <Label htmlFor="lu" className="sr-only">
              Usuario
            </Label>
            <Input
              id="lu"
              name="username"
              placeholder="Usuario"
              autoComplete="username"
              defaultValue={DEMO ? 'jperez' : undefined}
              aria-invalid={!!errors.username}
              className={fieldCls(errors.username)}
            />
            {errors.username && <p className="mt-1 text-[13px] font-semibold text-destructive">{errors.username}</p>}
          </div>
          <div className="relative mb-3 text-left">
            <Lock className="absolute top-[15px] left-3.5 size-5 text-muted-foreground" />
            <Label htmlFor="lp" className="sr-only">
              Contraseña
            </Label>
            <Input
              id="lp"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              className={fieldCls(errors.password)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute top-[7px] right-2 grid size-9 place-items-center rounded-lg text-muted-foreground"
            >
              {showPassword ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
            </button>
            {errors.password && <p className="mt-1 text-[13px] font-semibold text-destructive">{errors.password}</p>}
          </div>
          {errors.form && (
            <p role="alert" className="mb-2.5 text-left text-[13px] font-semibold text-destructive">
              {errors.form}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-[54px] w-full rounded-[14px] text-[16.5px] font-bold shadow-[0_8px_18px_var(--primary-ring)]"
          >
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> Ingresando
              </>
            ) : (
              'Iniciar sesión'
            )}
          </Button>
          <div className="mx-0.5 mt-3.5 flex items-center justify-between text-sm text-ink-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="remember" defaultChecked className="size-[18px] accent-primary" /> Recordarme
            </label>
            <button
              type="button"
              className="font-bold text-primary hover:underline"
              onClick={() =>
                toast('Pide a tu supervisor que restablezca tu contraseña: te dará una temporal para entrar.')
              }
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          {DEMO && (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Usuarios de prueba: jperez, mrios, cleon y supervisor (contraseña demo1234).
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
