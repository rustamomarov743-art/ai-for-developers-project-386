import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useBlocker } from 'react-router-dom'
import { useApiRequest } from './useApiRequest'
import {
  getAvailability,
  replaceAvailability,
} from './api/generated/sdk.gen'
import type {
  Availability,
  AvailabilityException,
  AvailabilityExceptionType,
  TimeInterval,
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
  exceptions: AvailabilityException[]
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

function todayInTimeZone(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    )
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return todayInTimeZone('UTC')
  }
}

function sortExceptions(exceptions: AvailabilityException[]) {
  return [...exceptions].sort((first, second) =>
    first.date.localeCompare(second.date),
  )
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

function validateIntervals(
  intervals: TimeInterval[],
  path: string,
  errors: Record<string, string>,
) {
  intervals.forEach((interval, index) => {
    if (!timePattern.test(interval.start)) {
      errors[`${path}[${index}].start`] = 'Формат времени — HH:mm'
    }
    if (!timePattern.test(interval.end)) {
      errors[`${path}[${index}].end`] = 'Формат времени — HH:mm'
    } else if (
      timePattern.test(interval.start) &&
      interval.start >= interval.end
    ) {
      errors[`${path}[${index}].end`] = 'Окончание должно быть позже начала'
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
      errors[path] = 'Интервалы не должны пересекаться'
    }
  }
}

function validateDraft(draft: AvailabilityDraft) {
  const errors: Record<string, string> = {}
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: draft.timeZone })
  } catch {
    errors.timeZone = 'Укажите корректный IANA-часовой пояс'
  }
  for (const day of days) {
    validateIntervals(
      draft.weeklyTemplate[day.key],
      `weeklyTemplate.${day.key}`,
      errors,
    )
  }
  const today = todayInTimeZone(draft.timeZone)
  const exceptionDates = new Set<string>()
  draft.exceptions.forEach((exception, exceptionIndex) => {
    const path = `exceptions[${exceptionIndex}]`
    if (!isValidDate(exception.date)) {
      errors[`${path}.date`] = 'Укажите дату в формате ГГГГ-ММ-ДД'
    } else {
      if (exceptionDates.has(exception.date)) {
        errors[`${path}.date`] = 'Исключение для этой даты уже добавлено'
      } else {
        exceptionDates.add(exception.date)
        if (exception.date < today) {
          errors[`${path}.date`] = 'Дата исключения не может быть в прошлом'
        }
      }
    }
    if (exception.type === 'CLOSED' && exception.intervals.length > 0) {
      errors[`${path}.intervals`] = 'Закрытый день не содержит интервалов'
    }
    if (exception.type === 'CUSTOM' && exception.intervals.length === 0) {
      errors[`${path}.intervals`] = 'Особое расписание требует хотя бы один интервал'
    }
    validateIntervals(exception.intervals, `${path}.intervals`, errors)
  })
  return errors
}

function AvailabilityPage() {
  const [saved, setSaved] = useState<Availability>({ exists: false })
  const [draft, setDraft] = useState<AvailabilityDraft>({
    timeZone: browserTimeZone(),
    weeklyTemplate: emptyWeeklyTemplate(),
    exceptions: [],
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
  const blocker = useBlocker(dirty)

  const request = useCallback(() => getAvailability(), [])
  const handleSuccess = useCallback((data: Availability) => {
    const nextDraft = data.exists
      ? {
          timeZone: data.timeZone ?? 'UTC',
          weeklyTemplate: data.weeklyTemplate ?? emptyWeeklyTemplate(),
          exceptions: data.exceptions ?? [],
        }
      : {
          timeZone: browserTimeZone(),
          weeklyTemplate: emptyWeeklyTemplate(),
          exceptions: [],
        }
    setSaved(data)
    setDraft(nextDraft)
    setSavedDraft(nextDraft)
    setVersionConflict(false)
    setFieldErrors({})
    setLoading(false)
  }, [])
  const handleFailure = useCallback(() => {
    setLoadFailed(true)
    setLoading(false)
  }, [])
  useApiRequest(loadAttempt, request, handleSuccess, handleFailure)

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Несохранённые изменения будут потеряны'
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Несохранённые изменения будут потеряны')) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

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

  function changeExceptions(
    change: (exceptions: AvailabilityException[]) => AvailabilityException[],
  ) {
    setDraft((current) => ({
      ...current,
      exceptions: sortExceptions(change(current.exceptions)),
    }))
  }

  function addException() {
    setDraft((current) => ({
      ...current,
      exceptions: sortExceptions([
        ...current.exceptions,
        {
          date: todayInTimeZone(current.timeZone),
          type: 'CLOSED',
          intervals: [],
        },
      ]),
    }))
  }

  function updateExceptionDate(index: number, date: string) {
    changeExceptions((exceptions) =>
      exceptions.map((exception, exceptionIndex) =>
        exceptionIndex === index ? { ...exception, date } : exception,
      ),
    )
  }

  function updateExceptionType(index: number, type: AvailabilityExceptionType) {
    changeExceptions((exceptions) =>
      exceptions.map((exception, exceptionIndex) =>
        exceptionIndex === index
          ? {
              ...exception,
              type,
              intervals: type === 'CLOSED' ? [] : exception.intervals,
            }
          : exception,
      ),
    )
  }

  function removeException(index: number) {
    changeExceptions((exceptions) =>
      exceptions.filter((_, exceptionIndex) => exceptionIndex !== index),
    )
  }

  function addExceptionInterval(exceptionIndex: number) {
    changeExceptions((exceptions) =>
      exceptions.map((exception, index) =>
        index === exceptionIndex
          ? {
              ...exception,
              intervals: [...exception.intervals, { start: '', end: '' }],
            }
          : exception,
      ),
    )
  }

  function updateExceptionInterval(
    exceptionIndex: number,
    intervalIndex: number,
    field: 'start' | 'end',
    value: string,
  ) {
    changeExceptions((exceptions) =>
      exceptions.map((exception, index) =>
        index === exceptionIndex
          ? {
              ...exception,
              intervals: exception.intervals.map((interval, indexToUpdate) =>
                indexToUpdate === intervalIndex
                  ? { ...interval, [field]: value }
                  : interval,
              ),
            }
          : exception,
      ),
    )
  }

  function removeExceptionInterval(exceptionIndex: number, intervalIndex: number) {
    changeExceptions((exceptions) =>
      exceptions.map((exception, index) =>
        index === exceptionIndex
          ? {
              ...exception,
              intervals: exception.intervals.filter(
                (_, indexToRemove) => indexToRemove !== intervalIndex,
              ),
            }
          : exception,
      ),
    )
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
          exceptions: data.exceptions ?? draft.exceptions,
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
        <section className="availability-exceptions" aria-labelledby="exceptions-title">
          <h2 id="exceptions-title">Исключения</h2>
          {draft.exceptions.length === 0 && <p>Исключений нет</p>}
          {draft.exceptions.map((exception, exceptionIndex) => (
            <div className="availability-exception" key={exceptionIndex}>
              <h3>Исключение {exceptionIndex + 1}</h3>
              <label htmlFor={`exception-${exceptionIndex}-date`}>
                Дата исключения {exceptionIndex + 1}
              </label>
              <input
                id={`exception-${exceptionIndex}-date`}
                type="date"
                value={exception.date}
                onChange={(event) =>
                  updateExceptionDate(exceptionIndex, event.target.value)
                }
              />
              {fieldErrors[`exceptions[${exceptionIndex}].date`] && (
                <p className="field-error">
                  {fieldErrors[`exceptions[${exceptionIndex}].date`]}
                </p>
              )}
              <label htmlFor={`exception-${exceptionIndex}-type`}>
                Тип исключения {exceptionIndex + 1}
              </label>
              <select
                id={`exception-${exceptionIndex}-type`}
                value={exception.type}
                onChange={(event) =>
                  updateExceptionType(
                    exceptionIndex,
                    event.target.value as AvailabilityExceptionType,
                  )
                }
              >
                <option value="CLOSED">Закрытый день</option>
                <option value="CUSTOM">Особое расписание</option>
              </select>
              {fieldErrors[`exceptions[${exceptionIndex}].type`] && (
                <p className="field-error">
                  {fieldErrors[`exceptions[${exceptionIndex}].type`]}
                </p>
              )}
              {exception.type === 'CLOSED' ? (
                <p>День закрыт</p>
              ) : (
                <>
                  {exception.intervals.length === 0 && <p>Интервалы не заданы</p>}
                  {exception.intervals.map((interval, intervalIndex) => (
                    <div className="availability-interval" key={intervalIndex}>
                      <label
                        htmlFor={`exception-${exceptionIndex}-${intervalIndex}-start`}
                      >
                        Исключение {exceptionIndex + 1}: начало {intervalIndex + 1}
                      </label>
                      <input
                        id={`exception-${exceptionIndex}-${intervalIndex}-start`}
                        type="time"
                        step={60}
                        value={interval.start}
                        onChange={(event) =>
                          updateExceptionInterval(
                            exceptionIndex,
                            intervalIndex,
                            'start',
                            event.target.value,
                          )
                        }
                      />
                      {fieldErrors[
                        `exceptions[${exceptionIndex}].intervals[${intervalIndex}].start`
                      ] && (
                        <p className="field-error">
                          {
                            fieldErrors[
                              `exceptions[${exceptionIndex}].intervals[${intervalIndex}].start`
                            ]
                          }
                        </p>
                      )}
                      <label
                        htmlFor={`exception-${exceptionIndex}-${intervalIndex}-end`}
                      >
                        Исключение {exceptionIndex + 1}: окончание {intervalIndex + 1}
                      </label>
                      <input
                        id={`exception-${exceptionIndex}-${intervalIndex}-end`}
                        type="time"
                        step={60}
                        value={interval.end}
                        onChange={(event) =>
                          updateExceptionInterval(
                            exceptionIndex,
                            intervalIndex,
                            'end',
                            event.target.value,
                          )
                        }
                      />
                      {fieldErrors[
                        `exceptions[${exceptionIndex}].intervals[${intervalIndex}].end`
                      ] && (
                        <p className="field-error">
                          {
                            fieldErrors[
                              `exceptions[${exceptionIndex}].intervals[${intervalIndex}].end`
                            ]
                          }
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          removeExceptionInterval(exceptionIndex, intervalIndex)
                        }
                      >
                        Удалить интервал {intervalIndex + 1} — исключение{' '}
                        {exceptionIndex + 1}
                      </button>
                    </div>
                  ))}
                  {fieldErrors[`exceptions[${exceptionIndex}].intervals`] && (
                    <p className="field-error">
                      {fieldErrors[`exceptions[${exceptionIndex}].intervals`]}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => addExceptionInterval(exceptionIndex)}
                  >
                    Добавить интервал — исключение {exceptionIndex + 1}
                  </button>
                </>
              )}
              <button
                type="button"
                className="remove-exception"
                onClick={() => removeException(exceptionIndex)}
              >
                Удалить исключение {exceptionIndex + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={addException}>
            Добавить исключение
          </button>
        </section>
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
