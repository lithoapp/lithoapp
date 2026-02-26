export const documentConfig = {
  mode: 'primary' as const,
  description: 'Helps build and edit Litho document pages',
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
