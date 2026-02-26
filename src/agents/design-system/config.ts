export const designSystemConfig = {
  mode: 'primary' as const,
  description: 'Edits Tailwind CSS design tokens in workspace styles',
  permission: {
    read: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'deny',
    task: 'deny',
    todowrite: 'deny',
    webfetch: 'deny',
    websearch: 'deny',
  } as const,
};
