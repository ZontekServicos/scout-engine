export async function getPlayerById(playerId: string) {
  return {
    id: playerId,
    name: "Jogador Exemplo",
    position: "Midfielder"
  };
}