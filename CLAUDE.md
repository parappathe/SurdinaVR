# SurdinaVR

Na Surdina: quebra-cabeça de furto por turnos em VR para o Meta Quest 3 no navegador (WebXR), sem
instalar nada. Num salão de museu à noite, uma mesa tem a maquete do andar a ser roubado. Você move o
ladrãozinho de listras uma casa por vez; a cada passo seu, os guardas andam a ronda deles, as câmeras
giram e os lasers ligam ou desligam. Pegue o diamante e saia pela porta verde sem entrar na luz da
lanterna. As paredes da maquete são altas: no VR você se abaixa e espia por cima e pelos cantos.
15 fases com 3 estrelas, desfazer ilimitado. Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos `https://parappathe.github.io/SurdinaVR/` e
apertar "Entrar em VR". (Publicação: `python publicar.py SurdinaVR` na pasta `C:\claude code`.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8885` (o painel de visualização usa
`.claude/launch.json`). `python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Andar | Pegar o ladrão (botão lateral ou pinça) e soltar na casa vizinha; ou raio + gatilho na casa | WASD ou setas; ou clicar na casa vizinha |
| Esperar um turno | Botão azul "Esperar" na beira da mesa (tocar ou raio) | Espaço, clicar no próprio ladrão ou no botão |
| Desfazer | Botão "Desfazer", ou A/X | Z ou Backspace |
| Recomeçar | Botão "Recomeçar" | R |
| Pausa | B ou Y | Esc ou P |
| Câmera | (sua cabeça: abaixe para espiar) | Botão direito arrastando, roda = zoom |
| FPS | Menu → FPS | Tecla F |

### Regras

- Mapa em casas (`js/levels.js`, legenda em `js/rules.js`): parede, chão, início, saída, diamante, moedas,
  cortina (esconderijo) e lasers. Norte = longe de você.
- Um turno: o ladrão anda uma casa (ou espera), depois todos os guardas dão um passo da ronda, as câmeras
  giram um quarto de volta e os lasers trocam (L aceso nos turnos pares, l nos ímpares).
- Guarda vê 3 casas para onde olha (amarelo no chão), câmera 4 (vermelho). A parede corta a visão.
  Guarda olha para onde vai andar; parado, pode girar a cabeça. Guarda dorminhoco cochila 2 turnos a
  cada 4 (zzz, sem lanterna).
- Pego: ficar numa casa vigiada (fora da cortina), pisar em laser aceso, esbarrar no guarda ou cruzar
  com ele. Pego, a fase para até você desfazer ou recomeçar.
- Prévia (liga no menu): losangos laranja onde vigias vão olhar no próximo turno.
- Estrelas: 1 = escapar com o diamante; 2 = com todas as moedas; 3 = e em até a meta de passos
  (solução mais curta com todas as moedas + 2 ou 3 de folga, calculada pelo resolvedor).
- Fases: 1 Primeiro passo, 2 Guarda parado, 3 A ronda, 4 A cortina, 5 Olho que gira, 6 Dois guardas,
  7 Laser, 8 Moedas na mira, 9 Quem vira a cabeça, 10 Cochilo, 11 Volta no bloco, 12 Corredor vermelho,
  13 Ala leste, 14 Labirinto de vitrines, 15 O cofre. Termine uma para liberar a próxima.
- Progresso salvo no navegador (localStorage, chave `surdinavr.v1`).

## Como testar

- `npm test` (ou `node tests/run.js`): regras (parede, saída sem diamante, visão de 3 casas e corte pela
  parede, cortina, ronda de ida e volta, olhar do guarda, laser, câmera girando, cochilo, estrelas); as 15
  fases têm solução com todas as moedas (busca em largura), o robô refaz e tira 3 estrelas, e os perigos
  atrapalham o caminho mais curto; e fumaça do `main.js` (carrega o jogo no Node com navegador e WebGL de
  mentira: teclado, clique na casa, botões da mesa, pego e desfazer, controle de VR de mentira pega o
  ladrão e solta na casa ao lado, robô passa as 15 fases dentro do jogo, `dev.win()`, pausa). Tem que
  terminar com "Tudo certo"; sai com código 1 se algo falhar (ou 200 s). Não toca som. Node 22.15+.
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()`, `dev.move('N')`,
  `dev.undo()`, `dev.loadLevel(3)`, `dev.win()`, `dev.screenOf(x, y)`, `dev.resetSave()`. `window.surdina`
  tem `level`, `st`, `world`, `shell`.

## Estrutura

- `js/rules.js`: leitura do mapa, rondas, visão, turno, detecção, resolvedor e estrelas.
- `js/levels.js`: as 15 fases (mapa em texto, guardas com pontos de passagem e `offset`, câmeras).
- `js/scene.js`: salão do museu, mesa, maquete (instâncias), ladrão, guardas, câmeras, lasers, cortinas.
- `js/main.js`: estados, menus, entrada, robô, `window.dev`.
- `js/shell.js`, `js/ui.js`, `js/visual3d.js`, `js/materiais3d.js`, `js/audio.js`, `js/save.js`.
- `tests/`: `run.js`, `smoke.js`, `three-stub.js`. `vendor/three`: Three.js r170.

## Decisões

- **Direção de arte:** maquete de museu: chão creme quadriculado, paredes azul-acinzentadas com tampa
  escura (dominante frio), madeira escura e dourado (secundária), amarelo da lanterna, vermelho do
  alarme e o ciano do diamante como destaque. Noite com luar frio de cima e luminária quente na mesa:
  escuro de clima, mas a maquete clara.
- O `offset` de cada ronda foi escolhido por busca (script de rascunho) para deixar a fase mais apertada
  com solução garantida.
- Desfazer ilimitado e a fase não termina ao ser pego: é quebra-cabeça, errar faz parte.
- Câmera em cima de parede é permitida (fica no alto da vitrine).

## Pendências / problemas conhecidos

- Falta testar no Quest: pegar o ladrão (raio de 7 cm), soltar na casa certa, ler a maquete de pé,
  botões da mesa com a mão.
