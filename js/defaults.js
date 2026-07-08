export const DEFAULT_PLAN = {
  days: [
    {
      id: 'push', name: 'Push (Empurrar)', short: 'Push',
      exercises: [
        { id: 'incline-db-press', name: 'Supino inclinado com halteres', sets: 4, reps: '8-12', alternatives: ['Supino inclinado barra', 'Supino inclinado máquina', 'Supino inclinado Smith'] },
        { id: 'flat-press', name: 'Supino reto na máquina ou halteres', sets: 3, reps: '8-12', alternatives: ['Supino reto barra', 'Crossover na polia', 'Voador / Peck deck'] },
        { id: 'shoulder-press', name: 'Desenvolvimento de ombro', sets: 3, reps: '8-12', alternatives: ['Desenvolvimento militar barra', 'Desenvolvimento Arnold', 'Desenvolvimento Smith'] },
        { id: 'lat-raise', name: 'Elevação lateral', sets: 4, reps: '12-15', alternatives: ['Elevação lateral polia', 'Elevação lateral máquina', 'Elevação lateral inclinado'] },
        { id: 'cable-fly', name: 'Crossover ou crucifixo na polia', sets: 3, reps: '12-15', alternatives: ['Peck deck / Voador', 'Crucifixo halteres', 'Crossover máquina'] },
        { id: 'tricep-pushdown', name: 'Tríceps na polia', sets: 3, reps: '10-15', alternatives: ['Tríceps testa', 'Tríceps francês', 'Mergulho / Máquina mergulho'] }
      ]
    },
    {
      id: 'pull', name: 'Pull (Puxar)', short: 'Pull',
      exercises: [
        { id: 'lat-pulldown', name: 'Puxada alta pegada aberta', sets: 4, reps: '8-12', alternatives: ['Barra fixa', 'Puxada Hammer', 'Puxada pegada neutra'] },
        { id: 'barbell-row', name: 'Remada curvada ou remada na máquina', sets: 4, reps: '8-12', alternatives: ['Remada cavalinho (T-bar)', 'Remada baixa polia', 'Remada serrote halter'] },
        { id: 'neutral-row', name: 'Remada baixa pegada neutra', sets: 3, reps: '10-12', alternatives: ['Remada máquina sentado', 'Remada unilateral polia', 'Pullover na polia'] },
        { id: 'face-pull', name: 'Crucifixo inverso / Face pull', sets: 3, reps: '15-20', alternatives: ['Reverse peck deck', 'Face pull corda', 'Crucifixo inverso halteres'] },
        { id: 'barbell-curl', name: 'Rosca direta', sets: 3, reps: '8-12', alternatives: ['Rosca halteres', 'Rosca polia', 'Rosca Scott'] },
        { id: 'hammer-curl', name: 'Rosca martelo', sets: 3, reps: '10-12', alternatives: ['Rosca martelo corda', 'Rosca inversa', 'Rosca concentrada'] }
      ]
    },
    {
      id: 'legs', name: 'Legs (Pernas)', short: 'Legs',
      exercises: [
        { id: 'squat', name: 'Agachamento livre ou Smith', sets: 4, reps: '6-10', alternatives: ['Hack squat', 'Leg press 45°', 'Agachamento goblet'] },
        { id: 'leg-press', name: 'Leg press', sets: 3, reps: '10-12', alternatives: ['Hack squat', 'Agachamento búlgaro', 'Leg press unilateral'] },
        { id: 'leg-extension', name: 'Cadeira extensora', sets: 3, reps: '12-15', alternatives: ['Extensora unilateral', 'Sissy squat', 'Hack squat pés baixos'] },
        { id: 'leg-curl', name: 'Mesa flexora deitado', sets: 3, reps: '10-12', alternatives: ['Cadeira flexora sentado', 'Flexora em pé', 'Stiff halteres'] },
        { id: 'rdl', name: 'Stiff / Terra romeno', sets: 3, reps: '8-12', alternatives: ['Mesa flexora', 'Hip thrust', 'Good morning'] },
        { id: 'calf-standing', name: 'Panturrilha em pé', sets: 4, reps: '12-20', alternatives: ['Panturrilha leg press', 'Panturrilha sentado', 'Panturrilha Smith'] }
      ]
    },
    {
      id: 'upper', name: 'Upper (Superior)', short: 'Upper',
      exercises: [
        { id: 'upper-flat-press', name: 'Supino reto', sets: 3, reps: '8-12', alternatives: ['Supino máquina', 'Supino halteres', 'Crossover'] },
        { id: 'upper-row', name: 'Remada na máquina ou polia', sets: 3, reps: '8-12', alternatives: ['Remada cavalinho', 'Remada baixa', 'Remada Hammer'] },
        { id: 'upper-pulldown', name: 'Puxada alta', sets: 3, reps: '8-12', alternatives: ['Barra fixa', 'Puxada neutra', 'Pullover polia'] },
        { id: 'upper-shoulder-press', name: 'Desenvolvimento de ombro', sets: 3, reps: '8-12', alternatives: ['Desenvolvimento máquina', 'Arnold', 'Militar barra'] },
        { id: 'upper-lat-raise', name: 'Elevação lateral', sets: 3, reps: '12-20', alternatives: ['Elevação polia', 'Elevação máquina', 'Elevação inclinado'] },
        { id: 'alt-curl', name: 'Rosca alternada', sets: 3, reps: '10-12', alternatives: ['Rosca direta', 'Rosca Scott', 'Rosca polia'] },
        { id: 'upper-tricep', name: 'Tríceps na polia', sets: 3, reps: '10-12', alternatives: ['Tríceps testa', 'Tríceps francês', 'Mergulho'] }
      ]
    },
    {
      id: 'lower', name: 'Lower (Inferior)', short: 'Lower',
      exercises: [
        { id: 'hack-squat', name: 'Hack squat ou Leg press', sets: 4, reps: '8-12', alternatives: ['Agachamento Smith', 'Leg press', 'Agachamento búlgaro'] },
        { id: 'lower-rdl', name: 'Stiff / Terra romeno', sets: 3, reps: '8-12', alternatives: ['Mesa flexora', 'Hip thrust', 'Good morning'] },
        { id: 'lower-extension', name: 'Cadeira extensora', sets: 3, reps: '12-15', alternatives: ['Extensora unilateral', 'Sissy squat', 'Leg press pés baixos'] },
        { id: 'lower-curl', name: 'Mesa / Cadeira flexora', sets: 3, reps: '12-15', alternatives: ['Flexora deitado', 'Flexora em pé', 'Stiff'] },
        { id: 'calf-seated', name: 'Panturrilha sentado', sets: 4, reps: '15-20', alternatives: ['Panturrilha em pé', 'Panturrilha leg press', 'Panturrilha Smith'] },
        { id: 'abs', name: 'Abdômen (prancha + elevação de pernas)', sets: 3, reps: '12-15', alternatives: ['Crunch polia', 'Máquina abdominal', 'Elevação pernas suspenso'], bodyweight: true }
      ]
    }
  ]
};
