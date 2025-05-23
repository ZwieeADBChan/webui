import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { InferInputSignals } from '@ngneat/spectator';
import { createComponentFactory, mockProvider, Spectator } from '@ngneat/spectator/jest';
import { of } from 'rxjs';
import { mockAuth } from 'app/core/testing/utils/mock-auth.utils';
import { EncryptionKeyFormat } from 'app/enums/encryption-key-format.enum';
import { DatasetDetails } from 'app/interfaces/dataset.interface';
import {
  EncryptionOptionsDialog,
} from 'app/pages/datasets/modules/encryption/components/encryption-options-dialog/encryption-options-dialog.component';
import {
  ExportDatasetKeyDialog,
} from 'app/pages/datasets/modules/encryption/components/export-dataset-key-dialog/export-dataset-key-dialog.component';
import {
  LockDatasetDialog,
} from 'app/pages/datasets/modules/encryption/components/lock-dataset-dialog/lock-dataset-dialog.component';
import { DatasetTreeStore } from 'app/pages/datasets/store/dataset-store.service';
import { ZfsEncryptionCardComponent } from './zfs-encryption-card.component';

describe('ZfsEncryptionCardComponent', () => {
  let spectator: Spectator<ZfsEncryptionCardComponent>;
  let loader: HarnessLoader;
  const createComponent = createComponentFactory({
    component: ZfsEncryptionCardComponent,
    providers: [
      mockProvider(MatDialog, {
        open: jest.fn(() => ({
          afterClosed: () => of(true),
        })),
      }),
      mockProvider(DatasetTreeStore, {
        datasetUpdated: jest.fn(),
      }),
      mockAuth(),
    ],
  });

  const passwordEncryptedRoot = {
    id: 'pool/dataset',
    name: 'pool/dataset',
    encryption_root: 'pool/dataset',
    locked: false,
    encrypted: true,
    key_format: {
      value: EncryptionKeyFormat.Passphrase,
    },
  } as DatasetDetails;

  const keyEncryptedRoot = {
    ...passwordEncryptedRoot,
    key_format: {
      value: EncryptionKeyFormat.Hex,
    },
    key_loaded: true,
  } as DatasetDetails;

  const lockedParent = {
    locked: true,
  } as DatasetDetails;

  function setupTest(props: InferInputSignals<ZfsEncryptionCardComponent> = {}): void {
    spectator = createComponent({ props });
    loader = TestbedHarnessEnvironment.loader(spectator.fixture);
  }

  function getDetails(): Record<string, string> {
    return spectator.queryAll('.details-item').reduce((acc, item: HTMLElement) => {
      const key = item.querySelector('.label')!.textContent!;
      const value = item.querySelector('.value')!.textContent!;
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
  }

  it('shows correct card state for key encrypted root', async () => {
    setupTest({ dataset: keyEncryptedRoot });

    const details = getDetails();
    expect(details).toEqual({
      'Encryption Root:': ' Yes  Help:  Encryption RootEncryption root means that dataset has its own encryption settings. Only encryption roots can be directly locked, unlocked, or have their keys changed. Child datasets will inherit encryption settings from the parent encryption root.',
      'Current State:': 'Unlocked',
      'Type:': ' Key ',
    });

    const buttons = await loader.getAllHarnesses(MatButtonHarness);
    expect(buttons).toHaveLength(3);
    expect(await buttons[0].getText()).toBe('Edit');
    expect(await buttons[1].getText()).toBe('Export Key');
    expect(await buttons[2].getText()).toBe('Lock');
    expect(await buttons[2].isDisabled()).toBeTruthy();
  });

  it('shows correct card state for password encrypted unlocked root', async () => {
    setupTest({ dataset: passwordEncryptedRoot });

    const details = getDetails();
    expect(details).toEqual({
      'Encryption Root:': ' Yes  Help:  Encryption RootEncryption root means that dataset has its own encryption settings. Only encryption roots can be directly locked, unlocked, or have their keys changed. Child datasets will inherit encryption settings from the parent encryption root.',
      'Current State:': 'Unlocked',
      'Type:': ' Passphrase ',
    });

    const buttons = await loader.getAllHarnesses(MatButtonHarness);
    expect(buttons).toHaveLength(2);
    expect(await buttons[0].getText()).toBe('Edit');
    expect(await buttons[1].getText()).toBe('Lock');
  });

  it('shows correct card state for password encrypted locked root', async () => {
    setupTest({
      dataset: {
        ...passwordEncryptedRoot,
        locked: true,
      },
    });

    const details = getDetails();
    expect(details).toEqual({
      'Encryption Root:': ' Yes  Help:  Encryption RootEncryption root means that dataset has its own encryption settings. Only encryption roots can be directly locked, unlocked, or have their keys changed. Child datasets will inherit encryption settings from the parent encryption root.',
      'Current State:': 'Locked',
      'Type:': ' Passphrase ',
    });

    const buttons = await loader.getAllHarnesses(MatButtonHarness);
    expect(buttons).toHaveLength(1);
    expect(await buttons[0].getText()).toBe('Unlock');
  });

  it('shows correct card state for dataset locked via parent', async () => {
    setupTest({
      dataset: {
        ...passwordEncryptedRoot,
        locked: true,
        encryption_root: 'pool',
      },
    });

    const details = getDetails();
    expect(details).toEqual({
      'Inherits Encryption From:': ' /pool ',
      'Current State:': 'Locked by parent',
      'Type:': ' Passphrase ',
    });

    const buttons = await loader.getAllHarnesses(MatButtonHarness);
    expect(buttons).toHaveLength(0);

    const goToLink = spectator.query('a');
    expect(goToLink).toHaveText('/pool');
    expect(goToLink).toHaveAttribute('href', '/datasets/pool');
  });

  it('does not allow to unlock a password encrypted root when it has a locked parent', async () => {
    setupTest({
      dataset: {
        ...passwordEncryptedRoot,
        locked: true,
      },
      parentDataset: lockedParent,
    });

    const buttons = await loader.getAllHarnesses(MatButtonHarness);
    expect(buttons).toHaveLength(0);
  });

  it('has an Unlock button that takes user to unlock screen', async () => {
    setupTest({
      dataset: {
        ...passwordEncryptedRoot,
        locked: true,
      },
    });

    const unlockButton = await loader.getHarness(MatButtonHarness.with({ text: 'Unlock' }));
    const unlockHref = await (await unlockButton.host()).getAttribute('href');

    expect(unlockHref).toBe('/datasets/pool%2Fdataset/unlock');
  });

  it('opens encryption options dialog when Edit button is pressed and reloads dataset tree when it is closed', async () => {
    setupTest({
      dataset: keyEncryptedRoot,
      parentDataset: lockedParent,
    });

    const editButton = await loader.getHarness(MatButtonHarness.with({ text: 'Edit' }));
    await editButton.click();

    expect(spectator.inject(MatDialog).open).toHaveBeenCalledWith(EncryptionOptionsDialog, {
      data: {
        dataset: keyEncryptedRoot,
        parent: lockedParent,
      },
    });
    expect(spectator.inject(DatasetTreeStore).datasetUpdated).toHaveBeenCalled();
  });

  it('opens a lock dialog when Lock button is pressed and reloads dataset tree when it is closed', async () => {
    setupTest({
      dataset: passwordEncryptedRoot,
    });

    const lockButton = await loader.getHarness(MatButtonHarness.with({ text: 'Lock' }));
    await lockButton.click();

    expect(spectator.inject(MatDialog).open).toHaveBeenCalledWith(LockDatasetDialog, {
      data: passwordEncryptedRoot,
    });
    expect(spectator.inject(DatasetTreeStore).datasetUpdated).toHaveBeenCalled();
  });

  it('opens an export key dialog when Export Key button is pressed', async () => {
    setupTest({
      dataset: keyEncryptedRoot,
    });

    const exportButton = await loader.getHarness(MatButtonHarness.with({ text: 'Export Key' }));
    await exportButton.click();

    expect(spectator.inject(MatDialog).open).toHaveBeenCalledWith(ExportDatasetKeyDialog, {
      data: keyEncryptedRoot,
    });
  });
});
