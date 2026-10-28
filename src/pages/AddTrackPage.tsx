import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepo } from '../data/RepoContext';
import { RepositoryError, type District } from '../data/repository';
import type { Category } from '../data/types';
import { parseGpxSegments, GpxParseError } from '../logic/gpx';
import { segmentsDistanceKm } from '../logic/geo';
import { validateTrackMeta, formatKm } from '../logic/format';
import { ActivityIcon, CATEGORY_LABELS } from '../components/ActivityIcon';

const CATEGORIES: Category[] = ['hike', 'bike', 'run', 'ski'];

/** Добавление трека (/add) и редактирование метаданных (/add/:trackId). */
export function AddTrackPage() {
  const { trackId } = useParams();
  const isEdit = Boolean(trackId);
  const repo = useRepo();
  const navigate = useNavigate();

  const [districts, setDistricts] = useState<District[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('hike');
  const [districtId, setDistrictId] = useState('');
  const [fileInfo, setFileInfo] = useState<
    { file: File; distanceKm: number } | { error: string } | null
  >(null);
  const [nameTouched, setNameTouched] = useState(isEdit);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Режим edit: предзаполнение метаданными, файл не заменяется.
  useEffect(() => {
    if (!trackId) return;
    let live = true;
    Promise.all([repo.listDistricts(), repo.getTrack(trackId)])
      .then(([list, track]) => {
        if (!live) return;
        setDistricts(list);
        setName(track.name);
        setDescription(track.description ?? '');
        setCategory(track.category);
        setDistrictId(track.districtId);
        setFileInfo({ file: new File([], track.originalFilename), distanceKm: track.distanceKm });
      })
      .catch(() => {
        if (live) setErrors(['Трек не найден.']);
      });
    return () => {
      live = false;
    };
  }, [repo, trackId]);

  useEffect(() => {
    if (isEdit) return;
    let live = true;
    repo.listDistricts().then((list) => {
      if (!live) return;
      setDistricts(list);
      setDistrictId((current) => current || (list.find((d) => d.isPrimary) ?? list[0])?.id || '');
    });
    return () => {
      live = false;
    };
  }, [repo, isEdit]);

  const parsedKm = fileInfo && 'distanceKm' in fileInfo ? fileInfo.distanceKm : null;
  const fileError = fileInfo && 'error' in fileInfo ? fileInfo.error : null;
  const canSave =
    !busy &&
    parsedKm !== null &&
    (!isEdit || Boolean(fileInfo)) &&
    validateTrackMeta({ districtId, category, name, description }).length === 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const segments = parseGpxSegments(await file.text());
      setFileInfo({ file, distanceKm: segmentsDistanceKm(segments) });
      if (!nameTouched && !name) {
        setName(file.name.replace(/\.gpx$/i, ''));
      }
    } catch (e) {
      setFileInfo({
        error: e instanceof GpxParseError ? e.message : 'Не удалось прочитать файл — похоже, это не GPX.',
      });
    }
  };

  const submit = async () => {
    const meta = { districtId, category, name, description };
    const validation = validateTrackMeta(meta);
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }
    setBusy(true);
    try {
      if (isEdit && trackId) {
        await repo.updateTrackMeta(trackId, meta);
        navigate(`/track/${trackId}`);
      } else if (fileInfo && 'file' in fileInfo) {
        const track = await repo.addTrack(fileInfo.file, meta);
        navigate(`/track/${track.id}`);
      }
    } catch (e) {
      setErrors([e instanceof RepositoryError ? e.message : 'Не получилось сохранить. Попробуйте ещё раз.']);
      setBusy(false);
    }
  };

  const counter = useMemo(() => `${description.length}/1000`, [description]);

  return (
    <div className="page">
      <header className="page__header">
        <button className="link" onClick={() => navigate(-1)}>
          ← отмена
        </button>
        <h1>{isEdit ? 'Изменить трек' : 'Новый трек'}</h1>
      </header>

      <div className="field">
        <label htmlFor="gpx-file">файл GPX</label>
        {isEdit ? null : (
          <input
            id="gpx-file"
            type="file"
            accept=".gpx,application/gpx+xml,text/xml"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        )}
        {parsedKm !== null && <p className="field__ok">✓ {formatKm(parsedKm)}</p>}
        {fileError && <p className="field__error">{fileError}</p>}
      </div>

      <div className="field">
        <label htmlFor="track-name">название</label>
        <input
          id="track-name"
          value={name}
          maxLength={200}
          onInput={(e) => {
            setName((e.target as HTMLInputElement).value);
            setNameTouched(true);
          }}
        />
      </div>

      <fieldset className="field">
        <legend>категория</legend>
        <div className="field__radios">
          {CATEGORIES.map((c) => (
            <label key={c} className="radio">
              <input
                type="radio"
                name="category"
                value={c}
                checked={category === c}
                onChange={() => setCategory(c)}
              />
              <ActivityIcon category={c} />
              <span>{CATEGORY_LABELS[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="track-district">район</label>
        <select
          id="track-district"
          value={districtId}
          onChange={(e) => setDistrictId(e.target.value)}
        >
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.isPrimary ? '⌂ ' : ''}
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="track-description">описание</label>
        <textarea
          id="track-description"
          value={description}
          rows={4}
          maxLength={1000}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
        />
        <span className="field__counter">{counter}</span>
      </div>

      {errors.length > 0 && (
        <ul className="form-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button className="btn btn--primary btn--big" disabled={!canSave} onClick={submit}>
        сохранить
      </button>
    </div>
  );
}
