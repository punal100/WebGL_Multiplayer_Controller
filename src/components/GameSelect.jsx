import { Link } from 'react-router-dom';
import { GAMES } from '../games.js';
import BrandLogo from './BrandLogo.jsx';

export default function GameSelect() {
  return (
    <div className="select">
      <BrandLogo className="brand-logo--corner" />
      <div className="select__inner">
        <h1 className="select__title">WebGL Multiplayer Controller</h1>
        <p className="select__subtitle">Pick a game to host on this screen</p>
        <div className="select__grid">
          {GAMES.map((game) => (
            <Link
              key={game.name}
              to={`/Game/${game.name}`}
              className="select__card"
            >
              <div className="select__card-name">{game.title}</div>
              <div className="select__card-tag">{game.tagline}</div>
              <div className="select__card-meta">
                {game.players} Players
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
