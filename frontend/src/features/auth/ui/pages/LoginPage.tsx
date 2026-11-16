import { useState, type SyntheticEvent } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { credentialsSchema } from '@/features/auth/domain/credentials'
import { useLogin } from '@/features/auth/ui/hooks'
import { LoginShowcase } from '@/features/auth/ui/components/login-showcase'
import { BrandMark } from '@/shared/ui/components/brand'
import { BRANDS } from '@/shared/types/brands'
import { useBrand } from '@/shared/ui/hooks/use-brand'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import { Label } from '@/shared/ui/components/shadcn/label'
import { cn } from '@/shared/ui/lib/utils'

type FieldErrors = Partial<Record<'username' | 'password' | 'form', string>>

/** Usuarios de prueba solo en desarrollo (o si el build lo pide): nunca en producción. */
const DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_USERS === 'true'

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const login = useLogin()
  const { brand } = useBrand()
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const busy = login.isPending
  const [shakeKey, setShakeKey] = useState(0)

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
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
    try {
      await login.mutateAsync(parsed.data)
      onLoggedIn()
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'No se pudo iniciar sesión.' })
      setShakeKey((k) => k + 1)
    }
  }

  const errorCls = 'mt-1 text-sm font-medium text-bad'

  return (
    <div className="grid min-h-dvh bg-background dsk:grid-cols-[1fr_1fr]">
      <LoginShowcase />
      <div className="flex items-start justify-center px-5 pt-14 pb-8 dsk:items-center dsk:pt-8">
        <form
          key={shakeKey}
          onSubmit={submit}
          noValidate
          aria-label="Inicio de sesión"
          className={cn('w-full max-w-sm', shakeKey > 0 && 'animate-shake')}
        >
          <div className="mb-8 flex items-center gap-3 dsk:mb-10">
            <BrandMark size={48} />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold hc:font-extrabold">{BRANDS[brand].name}</h1>
              <p className="text-sm text-muted-foreground">AviPlanner · Planificación de Demanda</p>
            </div>
          </div>

          <div className="mb-4">
            <Label htmlFor="lu" className="mb-1.5">
              Usuario
            </Label>
            <Input
              id="lu"
              name="username"
              placeholder="Usuario"
              autoComplete="username"
              defaultValue={DEMO ? 'rnavarro' : undefined}
              aria-invalid={!!errors.username}
              className="dsk:h-touch"
            />
            {errors.username && <p className={errorCls}>{errors.username}</p>}
          </div>
          <div className="mb-4">
            <Label htmlFor="lp" className="mb-1.5">
              Contraseña
            </Label>
            <div className="relative">
              <Input
                id="lp"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                className="pr-12 dsk:h-touch"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-md text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <Eye className="size-4.5" /> : <EyeOff className="size-4.5" />}
              </button>
            </div>
            {errors.password && <p className={errorCls}>{errors.password}</p>}
          </div>
          {errors.form && (
            <p
              role="alert"
              className="mb-4 rounded-md border border-bad-border bg-bad-soft px-3 py-2 text-sm text-foreground"
            >
              {errors.form}
            </p>
          )}

          <Button type="submit" disabled={busy} className="w-full dsk:h-touch">
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> Ingresando
              </>
            ) : (
              'Iniciar sesión'
            )}
          </Button>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 text-sm text-ink-2">
            <label className="flex min-h-touch cursor-pointer items-center gap-2">
              <input type="checkbox" name="remember" defaultChecked className="size-4.5 accent-primary" /> Recordarme
            </label>
            <button
              type="button"
              className="min-h-touch font-medium text-primary underline-offset-4 hover:underline"
              onClick={() =>
                toast('Pide a tu supervisor que restablezca tu contraseña: te dará una nueva para entrar.')
              }
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          {DEMO && (
            <p className="mt-6 border-t border-rule pt-4 text-xs text-muted-foreground">
              Usuarios de prueba: rnavarro, hdias, mcordova, supervisor y general (contraseña demo1234).
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
