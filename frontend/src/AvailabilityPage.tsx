import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  getAvailability,
  replaceAvailability,
} from './api/generated/sdk.gen'
import type {
  Availability,
  WeeklyTemplate,
} from './api/generated/types.gen'

const days: Array<{ key: keyof WeeklyTemplate; label: string }> = [
  { key: 'MONDAY', label: 'Понедельник' },
  { key: 'TUESDAY', label: 'Вторник' },
  { key: 'WEDNESDAY', label: 'Среда' },
  { key: 'THURSDAY', label: 'Четверг' },
  { key: 'FRIDAY', label: 'Пятница' },
  { key: 'SATURDAY', label: 'Суббота' },
  { key: 'SUNDAY', label: 'Воскресенье' },
]

type AvailabilityDraft = {
  timeZone: string
  weeklyTemplate: WeeklyTemplate
}

function emptyWeeklyTemplate(): WeeklyTemplate {
  return {
    MONDAY: [],
    TUESDAY: [],
    WEDNESDAY: [],
    THURSDAY: [],
    FRIDAY: [],
    SATURDAY: [],
    SUNDAY: [],
  }
}

function browserTimeZone() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!timeZone) return 'UTC'
  try {
    new Intl.DateTimeFormat(undefined, { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

function validateDraft(draft: AvailabilityDraft) {
  const errors: Record<string, string> = {}
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: draft.timeZone })
  } catch {
    errors.timeZone = 'Укажите корректный IANA-часовой пояс'
  }
  const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
  for (const day of days) {
    const intervals = draft.weeklyTemplate[day.key]
    intervals.forEach((interval, index) => {
      if (!timePattern.test(interval.start)) {
        errors[`weeklyTemplate.${day.key}[${index}].start`] =
          'Формат времени — HH:mm'
      }
      if (!timePattern.test(interval.end)) {
        errors[`weeklyTemplate.${day.key}[${index}].end`] =
          'Формат времени — HH:mm'
      } else if (
        timePattern.test(interval.start) &&
        interval.start >= interval.end
      ) {
        errors[`weeklyTemplate.${day.key}[${index}].end`] =
          'Окончание должно быть позже начала'
      }
    })
    const sorted = intervals
      .filter(
        (interval) =>
          timePattern.test(interval.start) && timePattern.test(interval.end),
      )
      .sort((first, second) => first.start.localeCompare(second.start))
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index - 1].end > sorted[index].start) {
        errors[`weeklyTemplate.${day.key}`] = 'Интервалы не должны пересекаться'
      }
    }
  }
  return errors
}

function AvailabilityPage() {
  const [saved, setSaved] = useState<Availability>({ exists: false })
  const [draft, setDraft] = useState<AvailabilityDraft>({
    timeZone: browserTimeZone(),
    weeklyTemplate: emptyWeeklyTemplate(),
  })
  const [savedDraft, setSavedDraft] = useState(draft)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [versionConflict, setVersionConflict] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)

  useEffect(() => {
    let active = true
    getAvailability()
      .then(({ data, response }) => {
        if (!active) return
        if (!response.ok || !data) {
          setLoadFailed(true)
          setLoading(false)
          return
        }
        const nextDraft = data.exists
          ? {
              timeZone: data.timeZone ?? 'UTC',
              weeklyTemplate: data.weeklyTemplate ?? emptyWeeklyTemplate(),
            }
          : { timeZone: browserTimeZone(), weeklyTemplate: emptyWeeklyTemplate() }
        setSaved(data)
        setDraft(nextDraft)
        setSavedDraft(nextDraft)
        setVersionConflict(false)
        setFieldErrors({})
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setLoadFailed(true)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadAttempt])

  useEffect(() => {
    if (!dirty) return
    const message = 'Несохранённые изменения будут потеряны'
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
    }
    const handleLinkClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest('a') && !window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleLinkClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleLinkClick, true)
    }
  }, [dirty])

  function addInterval(day: keyof WeeklyTemplate) {
    setDraft((current) => ({
      ...current,
      weeklyTemplate: {
        ...current.weeklyTemplate,
        [day]: [...current.weeklyTemplate[day], { start: '', end: '' }],
      },
    }))
  }

  function removeInterval(day: keyof WeeklyTemplate, index: number) {
    setDraft((current) => ({
      ...current,
      weeklyTemplate: {
        ...current.weeklyTemplate,
        [day]: current.weeklyTemplate[day].filter(
          (_, intervalIndex) => intervalIndex !== index,
        ),
      },
    }))
  }

  function updateInterval(
    day: keyof WeeklyTemplate,
    index: number,
    field: 'start' | 'end',
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      weeklyTemplate: {
        ...current.weeklyTemplate,
        [day]: current.weeklyTemplate[day].map((interval, intervalIndex) =>
          intervalIndex === index ? { ...interval, [field]: value } : interval,
        ),
      },
    }))
  }

  function handleCancel() {
    if (!window.confirm('Отменить несохранённые изменения?')) return
    setDraft(savedDraft)
    setSavedMessage(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationErrors = validateDraft(draft)
    setFieldErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return
    setSaving(true)
    setSavedMessage(false)
    setSaveFailed(false)
    setVersionConflict(false)
    try {
      const { data, error, response } = await replaceAvailability({
        body: {
          ...draft,
          expectedVersion: saved.exists ? (saved.version ?? null) : null,
        },
      })
      if (response.ok && data) {
        const nextDraft = {
          timeZone: data.timeZone ?? draft.timeZone,
          weeklyTemplate: data.weeklyTemplate ?? draft.weeklyTemplate,
        }
        setSaved(data)
        setDraft(nextDraft)
        setSavedDraft(nextDraft)
        setSavedMessage(true)
      } else if (error?.code === 'AVAILABILITY_VERSION_CONFLICT') {
        setVersionConflict(true)
      } else if (error?.errors) {
        setFieldErrors(
          Object.fromEntries(
            error.errors.map((fieldError) => [fieldError.path, fieldError.message]),
          ),
        )
      } else {
        setSaveFailed(true)
      }
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  function reloadAfterConflict() {
    if (dirty && !window.confirm('Загрузить актуальную версию и потерять черновик?')) {
      return
    }
    setVersionConflict(false)
    setLoadAttempt((value) => value + 1)
  }

  if (loading) {
    return (
      <main className="owner-content">
        <h1>Доступность</h1>
        <p role="status">Загрузка…</p>
      </main>
    )
  }

  if (loadFailed) {
    return (
      <main className="owner-content">
        <h1>Доступность</h1>
        <div role="alert">
          <p>Не удалось загрузить доступность</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setLoadFailed(false)
              setLoadAttempt((value) => value + 1)
            }}
          >
            Повторить
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="owner-content">
      <h1>Доступность</h1>
      <p>Изменения расписания не отменяют и не переносят существующие встречи.</p>
      <form className="availability-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="availability-time-zone">Часовой пояс</label>
        <input
          id="availability-time-zone"
          value={draft.timeZone}
          readOnly={saved.exists}
          onChange={(event) =>
            setDraft((current) => ({ ...current, timeZone: event.target.value }))
          }
        />
        {fieldErrors.timeZone && (
          <p className="field-error">{fieldErrors.timeZone}</p>
        )}
        {days.map((day) => (
          <details key={day.key} className="availability-day">
            <summary>{day.label}</summary>
            {draft.weeklyTemplate[day.key].length === 0 && (
              <p>Интервалы не заданы</p>
            )}
            {draft.weeklyTemplate[day.key].map((interval, index) => (
              <div className="availability-interval" key={index}>
                <label htmlFor={`${day.key}-${index}-start`}>
                  {day.label}: начало {index + 1}
                </label>
                <input
                  id={`${day.key}-${index}-start`}
                  type="time"
                  step={60}
                  value={interval.start}
                  onChange={(event) =>
                    updateInterval(day.key, index, 'start', event.target.value)
                  }
                />
                {fieldErrors[`weeklyTemplate.${day.key}[${index}].start`] && (
                  <p className="field-error">
                    {fieldErrors[`weeklyTemplate.${day.key}[${index}].start`]}
                  </p>
                )}
                <label htmlFor={`${day.key}-${index}-end`}>
                  {day.label}: окончание {index + 1}
                </label>
                <input
                  id={`${day.key}-${index}-end`}
                  type="time"
                  step={60}
                  value={interval.end}
                  onChange={(event) =>
                    updateInterval(day.key, index, 'end', event.target.value)
                  }
                />
                {fieldErrors[`weeklyTemplate.${day.key}[${index}].end`] && (
                  <p className="field-error">
                    {fieldErrors[`weeklyTemplate.${day.key}[${index}].end`]}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => removeInterval(day.key, index)}
                >
                  Удалить интервал {index + 1} — {day.label}
                </button>
              </div>
            ))}
            {fieldErrors[`weeklyTemplate.${day.key}`] && (
              <p className="field-error">
                {fieldErrors[`weeklyTemplate.${day.key}`]}
              </p>
            )}
            <button type="button" onClick={() => addInterval(day.key)}>
              Добавить интервал — {day.label}
            </button>
          </details>
        ))}
        <div className="availability-actions">
          <button
            type="submit"
            disabled={saving || (saved.exists && !dirty)}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" disabled={!dirty || saving} onClick={handleCancel}>
            Отменить изменения
          </button>
        </div>
      </form>
      {savedMessage && <p role="status">Доступность сохранена</p>}
      {saveFailed && (
        <p role="alert">Не удалось сохранить доступность. Попробуйте ещё раз</p>
      )}
      {versionConflict && (
        <div role="alert">
          <p>Расписание изменилось в другой вкладке. Загрузите актуальную версию</p>
          <button type="button" onClick={reloadAfterConflict}>
            Загрузить актуальную версию
          </button>
        </div>
      )}
    </main>
  )
}

export default AvailabilityPage
