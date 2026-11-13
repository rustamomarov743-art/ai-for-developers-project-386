import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createMeetingType,
  listMeetingTypes,
} from './api/generated/sdk.gen'
import type { MeetingType } from './api/generated/types.gen'

function MeetingTypesPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [created, setCreated] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true

    listMeetingTypes()
      .then(({ data, response }) => {
        if (!active) return
        if (response.ok && data) {
          setMeetingTypes(data)
          setLoading(false)
        } else {
          setLoadFailed(true)
          setLoading(false)
        }
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreated(false)
    setCreateFailed(false)
    setFieldErrors({})
    setCreating(true)
    try {
      const { data, error, response } = await createMeetingType({
        body: {
          name,
          description,
          durationMinutes: Number(durationMinutes),
        },
      })
      if (response.ok && data) {
        setMeetingTypes((current) => [...current, data])
        setName('')
        setDescription('')
        setDurationMinutes('')
        setCreated(true)
      } else if (error?.errors) {
        setFieldErrors(
          Object.fromEntries(
            error.errors.map((fieldError) => [fieldError.path, fieldError.message]),
          ),
        )
      } else {
        setCreateFailed(true)
      }
    } catch {
      setCreateFailed(true)
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="owner-content">
      <h1>Типы встреч</h1>
      <form className="meeting-type-form" onSubmit={handleSubmit}>
        <label htmlFor="meeting-type-name">Название</label>
        <input
          id="meeting-type-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
        />
        {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
        <label htmlFor="meeting-type-description">Описание</label>
        <textarea
          id="meeting-type-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={1000}
          required
        />
        {fieldErrors.description && (
          <p className="field-error">{fieldErrors.description}</p>
        )}
        <label htmlFor="meeting-type-duration">Длительность (минуты)</label>
        <input
          id="meeting-type-duration"
          type="number"
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
          min={1}
          max={1440}
          required
        />
        {fieldErrors.durationMinutes && (
          <p className="field-error">{fieldErrors.durationMinutes}</p>
        )}
        <button type="submit" disabled={creating}>
          {creating ? 'Создание…' : 'Создать тип'}
        </button>
      </form>
      {created && <p role="status">Тип встречи создан</p>}
      {createFailed && (
        <p role="alert">Не удалось создать тип встречи. Попробуйте ещё раз</p>
      )}
      <details className="meeting-types-list">
        <summary>Список типов</summary>
        {loading && <p role="status">Загрузка…</p>}
        {loadFailed && (
          <div role="alert">
            <p>Не удалось загрузить типы встреч</p>
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
        )}
        {!loading && !loadFailed && meetingTypes.length === 0 && (
          <p>Типы встреч пока не созданы</p>
        )}
        <ul>
          {meetingTypes.map((meetingType) => (
            <li key={meetingType.id}>
              <h2>{meetingType.name}</h2>
              <p>{meetingType.description}</p>
              <p>{meetingType.durationMinutes} мин</p>
            </li>
          ))}
        </ul>
      </details>
    </main>
  )
}

export default MeetingTypesPage
