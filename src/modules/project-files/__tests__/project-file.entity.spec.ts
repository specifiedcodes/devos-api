/**
 * ProjectFile Entity Tests
 * Story 16.2: File Upload/Download API (AC1)
 */

import { getMetadataArgsStorage } from 'typeorm';
import { ProjectFile } from '../../../database/entities/project-file.entity';

describe('ProjectFile Entity', () => {
  const metadata = getMetadataArgsStorage();

  it('should have table name "project_files"', () => {
    const tableMetadata = metadata.tables.find(
      (t) => t.target === ProjectFile,
    );
    expect(tableMetadata).toBeDefined();
    expect(tableMetadata!.name).toBe('project_files');
  });

  it('should have schema "public"', () => {
    const tableMetadata = metadata.tables.find(
      (t) => t.target === ProjectFile,
    );
    expect(tableMetadata).toBeDefined();
    expect(tableMetadata!.schema).toBe('public');
  });

  it('should have uuid primary generated column "id"', () => {
    const generatedColumns = metadata.generations.filter(
      (g) => g.target === ProjectFile,
    );
    const idGen = generatedColumns.find((g) => g.propertyName === 'id');
    expect(idGen).toBeDefined();
    expect(idGen!.strategy).toBe('uuid');
  });

  it('should have all required columns', () => {
    const columns = metadata.columns.filter(
      (c) => c.target === ProjectFile,
    );
    const columnNames = columns.map((c) => c.propertyName);

    expect(columnNames).toContain('projectId');
    expect(columnNames).toContain('workspaceId');
    expect(columnNames).toContain('filename');
    expect(columnNames).toContain('path');
    expect(columnNames).toContain('mimeType');
    expect(columnNames).toContain('sizeBytes');
    expect(columnNames).toContain('storageKey');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('uploadedBy');
  });

  it('should have correct column name mappings', () => {
    const columns = metadata.columns.filter(
      (c) => c.target === ProjectFile,
    );

    const projectIdCol = columns.find((c) => c.propertyName === 'projectId');
    expect(projectIdCol?.options?.name).toBe('project_id');

    const workspaceIdCol = columns.find((c) => c.propertyName === 'workspaceId');
    expect(workspaceIdCol?.options?.name).toBe('workspace_id');

    const mimeTypeCol = columns.find((c) => c.propertyName === 'mimeType');
    expect(mimeTypeCol?.options?.name).toBe('mime_type');

    const sizeBytesCol = columns.find((c) => c.propertyName === 'sizeBytes');
    expect(sizeBytesCol?.options?.name).toBe('size_bytes');

    const storageKeyCol = columns.find((c) => c.propertyName === 'storageKey');
    expect(storageKeyCol?.options?.name).toBe('storage_key');

    const uploadedByCol = columns.find((c) => c.propertyName === 'uploadedBy');
    expect(uploadedByCol?.options?.name).toBe('uploaded_by');
  });

  it('should have sizeBytes column type as bigint', () => {
    const columns = metadata.columns.filter(
      (c) => c.target === ProjectFile,
    );
    const sizeBytesCol = columns.find((c) => c.propertyName === 'sizeBytes');
    expect(sizeBytesCol?.options?.type).toBe('bigint');
  });

  it('should have description as nullable', () => {
    const columns = metadata.columns.filter(
      (c) => c.target === ProjectFile,
    );
    const descCol = columns.find((c) => c.propertyName === 'description');
    expect(descCol?.options?.nullable).toBe(true);
  });

  it('should have ManyToOne relations to Project, Workspace, and User', () => {
    const relations = metadata.relations.filter(
      (r) => r.target === ProjectFile,
    );

    const projectRelation = relations.find(
      (r) => r.propertyName === 'project',
    );
    expect(projectRelation).toBeDefined();
    expect(projectRelation!.relationType).toBe('many-to-one');

    const workspaceRelation = relations.find(
      (r) => r.propertyName === 'workspace',
    );
    expect(workspaceRelation).toBeDefined();
    expect(workspaceRelation!.relationType).toBe('many-to-one');

    const uploaderRelation = relations.find(
      (r) => r.propertyName === 'uploader',
    );
    expect(uploaderRelation).toBeDefined();
    expect(uploaderRelation!.relationType).toBe('many-to-one');
  });

  it('should have DeleteDateColumn on deletedAt for soft delete', () => {
    const columns = metadata.columns.filter(
      (c) => c.target === ProjectFile,
    );
    const deletedAtCol = columns.find(
      (c) => c.propertyName === 'deletedAt',
    );
    expect(deletedAtCol).toBeDefined();
    expect(deletedAtCol?.options?.name).toBe('deleted_at');
    expect(deletedAtCol?.options?.nullable).toBe(true);

    // Check it is a DeleteDateColumn via mode
    expect(deletedAtCol?.mode).toBe('deleteDate');
  });

  it('should have CreateDateColumn on createdAt', () => {
    const columns = metadata.columns.filter(
      (c) => c.target === ProjectFile,
    );
    const createdAtCol = columns.find(
      (c) => c.propertyName === 'createdAt',
    );
    expect(createdAtCol).toBeDefined();
    expect(createdAtCol?.mode).toBe('createDate');
  });

  it('should have UpdateDateColumn on updatedAt', () => {
    const columns = metadata.columns.filter(
      (c) => c.target === ProjectFile,
    );
    const updatedAtCol = columns.find(
      (c) => c.propertyName === 'updatedAt',
    );
    expect(updatedAtCol).toBeDefined();
    expect(updatedAtCol?.mode).toBe('updateDate');
  });

  it('should have indexes on workspaceId, projectId, uploadedBy, mimeType, deletedAt', () => {
    const indexes = metadata.indices.filter(
      (i) => i.target === ProjectFile,
    );

    // Find indexes by their column names
    const indexColumns = indexes.map((i) => i.columns);

    // Check individual column indexes exist
    expect(indexColumns).toContainEqual(['workspaceId']);
    expect(indexColumns).toContainEqual(['projectId']);
    expect(indexColumns).toContainEqual(['uploadedBy']);
    expect(indexColumns).toContainEqual(['mimeType']);
    expect(indexColumns).toContainEqual(['deletedAt']);
  });

  it('should have unique partial index on (projectId, path, filename) with WHERE deleted_at IS NULL', () => {
    const indexes = metadata.indices.filter(
      (i) => i.target === ProjectFile,
    );

    const uniqueIndex = indexes.find(
      (i) =>
        i.unique === true &&
        Array.isArray(i.columns) &&
        i.columns.includes('projectId') &&
        i.columns.includes('path') &&
        i.columns.includes('filename'),
    );

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex!.where).toBe('"deleted_at" IS NULL');
  });

  it('should be instantiable with correct shape', () => {
    const file = new ProjectFile();
    file.id = '550e8400-e29b-41d4-a716-446655440000';
    file.projectId = '550e8400-e29b-41d4-a716-446655440001';
    file.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
    file.filename = 'test.pdf';
    file.path = '/docs';
    file.mimeType = 'application/pdf';
    file.sizeBytes = 1024;
    file.storageKey = 'ws1/proj1/uuid1/test.pdf';
    file.uploadedBy = '550e8400-e29b-41d4-a716-446655440003';
    file.createdAt = new Date();
    file.updatedAt = new Date();

    expect(file.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(file.filename).toBe('test.pdf');
    expect(file.sizeBytes).toBe(1024);
    expect(file.deletedAt).toBeUndefined();
  });
});
