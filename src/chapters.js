const titles = { overview: 'Overview', changes: 'Changes', design: 'Design', review: 'Review', details: 'Details' };

export function chapters(doc) {
  if (!doc.sections[0].group) return doc.sections.map(section => ({ id: `section-${section.id}`, title: section.title, sections: [section.id] }));
  return Object.entries(titles).filter(([group]) => doc.sections.some(section => section.group === group)).map(([group, title]) => ({
    id: `view-${group}`, title, sections: doc.sections.filter(section => section.group === group).map(section => section.id), supporting: group === 'details',
  }));
}
