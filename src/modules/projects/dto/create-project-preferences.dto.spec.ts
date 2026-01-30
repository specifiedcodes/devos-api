import { validate } from 'class-validator';
import { CreateProjectPreferencesDto } from './create-project-preferences.dto';
import {
  RepositoryStructure,
  CodeStyle,
  GitWorkflow,
  TestingStrategy,
} from '../../../database/entities/project-preferences.entity';

describe('CreateProjectPreferencesDto', () => {
  it('should pass validation with valid enum values', async () => {
    const dto = new CreateProjectPreferencesDto();
    dto.repositoryStructure = RepositoryStructure.MONOREPO;
    dto.codeStyle = CodeStyle.FUNCTIONAL;
    dto.gitWorkflow = GitWorkflow.GITHUB_FLOW;
    dto.testingStrategy = TestingStrategy.BALANCED;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation with invalid repositoryStructure', async () => {
    const dto = new CreateProjectPreferencesDto();
    (dto as any).repositoryStructure = 'invalid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('repositoryStructure');
  });

  it('should fail validation with invalid codeStyle', async () => {
    const dto = new CreateProjectPreferencesDto();
    (dto as any).codeStyle = 'invalid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('codeStyle');
  });

  it('should fail validation with invalid gitWorkflow', async () => {
    const dto = new CreateProjectPreferencesDto();
    (dto as any).gitWorkflow = 'invalid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('gitWorkflow');
  });

  it('should fail validation with invalid testingStrategy', async () => {
    const dto = new CreateProjectPreferencesDto();
    (dto as any).testingStrategy = 'invalid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('testingStrategy');
  });

  it('should pass validation when all fields are undefined', async () => {
    const dto = new CreateProjectPreferencesDto();

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept all RepositoryStructure enum values', async () => {
    const dtoMonorepo = new CreateProjectPreferencesDto();
    dtoMonorepo.repositoryStructure = RepositoryStructure.MONOREPO;
    expect((await validate(dtoMonorepo)).length).toBe(0);

    const dtoPolyrepo = new CreateProjectPreferencesDto();
    dtoPolyrepo.repositoryStructure = RepositoryStructure.POLYREPO;
    expect((await validate(dtoPolyrepo)).length).toBe(0);
  });

  it('should accept all CodeStyle enum values', async () => {
    const dtoFunctional = new CreateProjectPreferencesDto();
    dtoFunctional.codeStyle = CodeStyle.FUNCTIONAL;
    expect((await validate(dtoFunctional)).length).toBe(0);

    const dtoOOP = new CreateProjectPreferencesDto();
    dtoOOP.codeStyle = CodeStyle.OOP;
    expect((await validate(dtoOOP)).length).toBe(0);
  });

  it('should accept all GitWorkflow enum values', async () => {
    const dtoGithubFlow = new CreateProjectPreferencesDto();
    dtoGithubFlow.gitWorkflow = GitWorkflow.GITHUB_FLOW;
    expect((await validate(dtoGithubFlow)).length).toBe(0);

    const dtoGitFlow = new CreateProjectPreferencesDto();
    dtoGitFlow.gitWorkflow = GitWorkflow.GIT_FLOW;
    expect((await validate(dtoGitFlow)).length).toBe(0);
  });

  it('should accept all TestingStrategy enum values', async () => {
    const dtoUnitHeavy = new CreateProjectPreferencesDto();
    dtoUnitHeavy.testingStrategy = TestingStrategy.UNIT_HEAVY;
    expect((await validate(dtoUnitHeavy)).length).toBe(0);

    const dtoBalanced = new CreateProjectPreferencesDto();
    dtoBalanced.testingStrategy = TestingStrategy.BALANCED;
    expect((await validate(dtoBalanced)).length).toBe(0);

    const dtoE2EHeavy = new CreateProjectPreferencesDto();
    dtoE2EHeavy.testingStrategy = TestingStrategy.E2E_HEAVY;
    expect((await validate(dtoE2EHeavy)).length).toBe(0);
  });
});
