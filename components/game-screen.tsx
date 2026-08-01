type GamePlayer = {
  playerId: string
  name: string
  role: 'host' | 'player'
  position: number
}

export function GameScreen({ player }: { player: GamePlayer }) {
  return (
    <main
      className="min-h-screen"
      aria-label={`Game for ${player.name}`}
      data-player-position={player.position}
    />
  )
}
