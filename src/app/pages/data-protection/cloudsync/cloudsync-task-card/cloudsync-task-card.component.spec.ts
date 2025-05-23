import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import { Spectator } from '@ngneat/spectator';
import { createComponentFactory, mockProvider } from '@ngneat/spectator/jest';
import { provideMockStore } from '@ngrx/store/testing';
import { MockPipe } from 'ng-mocks';
import { of } from 'rxjs';
import { mockCall, mockApi } from 'app/core/testing/utils/mock-api.utils';
import { mockAuth } from 'app/core/testing/utils/mock-auth.utils';
import { CloudSyncProviderName } from 'app/enums/cloudsync-provider.enum';
import { Direction } from 'app/enums/direction.enum';
import { JobState } from 'app/enums/job-state.enum';
import { TransferMode } from 'app/enums/transfer-mode.enum';
import { CloudSyncTaskUi } from 'app/interfaces/cloud-sync-task.interface';
import { Job } from 'app/interfaces/job.interface';
import { ScheduleDescriptionPipe } from 'app/modules/dates/pipes/schedule-description/schedule-description.pipe';
import { DialogService } from 'app/modules/dialog/dialog.service';
import { IxTableHarness } from 'app/modules/ix-table/components/ix-table/ix-table.harness';
import {
  IxCellScheduleComponent,
} from 'app/modules/ix-table/components/ix-table-body/cells/ix-cell-schedule/ix-cell-schedule.component';
import { selectJobs } from 'app/modules/jobs/store/job.selectors';
import { LocaleService } from 'app/modules/language/locale.service';
import { SlideIn } from 'app/modules/slide-ins/slide-in';
import { SnackbarService } from 'app/modules/snackbar/services/snackbar.service';
import { ApiService } from 'app/modules/websocket/api.service';
import { CloudSyncFormComponent } from 'app/pages/data-protection/cloudsync/cloudsync-form/cloudsync-form.component';
import {
  CloudSyncRestoreDialog,
} from 'app/pages/data-protection/cloudsync/cloudsync-restore-dialog/cloudsync-restore-dialog.component';
import {
  CloudSyncTaskCardComponent,
} from 'app/pages/data-protection/cloudsync/cloudsync-task-card/cloudsync-task-card.component';
import { CloudSyncWizardComponent } from 'app/pages/data-protection/cloudsync/cloudsync-wizard/cloudsync-wizard.component';
import { TaskService } from 'app/services/task.service';
import { selectSystemConfigState } from 'app/store/system-config/system-config.selectors';

describe('CloudSyncTaskCardComponent', () => {
  let spectator: Spectator<CloudSyncTaskCardComponent>;
  let loader: HarnessLoader;
  let table: IxTableHarness;

  const cloudsyncTasks = [
    {
      id: 3,
      description: 'custom-cloudsync',
      path: '/mnt/APPS',
      include: [
        '//**',
        '/Folder1/**',
      ],
      transfers: 4,
      args: '',
      enabled: false,
      direction: Direction.Pull,
      transfer_mode: TransferMode.Copy,
      credentials: {
        id: 1,
        name: 'Google Drive',
        provider: {
          type: CloudSyncProviderName.GoogleDrive,
          client_id: '',
          client_secret: '',
          token: '',
          team_drive: '',
        } as Record<string, string>,
      },
      schedule: {
        minute: '0',
        hour: '0',
        dom: '*',
        month: '*',
        dow: '*',
      },
      locked: false,
      credential: 'Google Drive',
      next_run_time: '2023-09-19T21:00:00.000Z',
      next_run: 'in about 21 hours',
      state: {
        state: JobState.Running,
      },
      job: {
        id: 1,
        state: JobState.Finished,
        time_finished: {
          $date: new Date().getTime() - 50000,
        },
      },
    } as CloudSyncTaskUi,
  ];

  const createComponent = createComponentFactory({
    component: CloudSyncTaskCardComponent,
    overrideComponents: [
      [
        IxCellScheduleComponent, {
          remove: { imports: [ScheduleDescriptionPipe] },
          add: { imports: [MockPipe(ScheduleDescriptionPipe, jest.fn(() => 'Every hour, every day'))] },
        },
      ],
    ],
    providers: [
      mockAuth(),
      provideMockStore({
        selectors: [
          {
            selector: selectJobs,
            value: [{
              state: JobState.Finished,
              id: 1,
              time_finished: cloudsyncTasks[0].job!.time_finished,
            } as Job],
          },
          {
            selector: selectSystemConfigState,
            value: {},
          },
        ],
      }),
      mockApi([
        mockCall('cloudsync.query', cloudsyncTasks),
        mockCall('cloudsync.delete'),
        mockCall('cloudsync.update'),
      ]),
      mockProvider(DialogService, {
        confirm: jest.fn(() => of(true)),
      }),
      mockProvider(SlideIn, {
        open: jest.fn(() => of()),
      }),
      mockProvider(SlideIn, {
        open: jest.fn(() => of()),
      }),
      mockProvider(MatDialog, {
        open: jest.fn(() => ({
          afterClosed: () => of(true),
        })),
      }),
      mockProvider(LocaleService),
      mockProvider(TaskService, {
        getTaskNextTime: jest.fn(() => new Date(new Date().getTime() + (25 * 60 * 60 * 1000))),
      }),
      mockProvider(SnackbarService),
    ],
  });

  beforeEach(async () => {
    spectator = createComponent();
    loader = TestbedHarnessEnvironment.loader(spectator.fixture);
    table = await loader.getHarness(IxTableHarness);
  });

  it('should show table rows', async () => {
    const expectedRows = [
      ['Description', 'Frequency', 'Next Run', 'Last Run', 'Enabled', 'State', ''],
      ['custom-cloudsync', 'Every hour, every day', 'Disabled', '1 min. ago', '', 'FINISHED', ''],
    ];

    const cells = await table.getCellTexts();
    expect(cells).toEqual(expectedRows);
  });

  it('shows form to edit an existing CloudSync Task when Edit button is pressed', async () => {
    const [menu] = await loader.getAllHarnesses(MatMenuHarness.with({ selector: '[mat-icon-button]' }));
    await menu.open();
    await menu.clickItem({ text: 'Edit' });

    expect(spectator.inject(SlideIn).open).toHaveBeenCalledWith(
      CloudSyncFormComponent,
      {
        wide: true,
        data: cloudsyncTasks[0],
      },
    );
  });

  it('shows form to create new CloudSync Task when Add button is pressed', async () => {
    const addButton = await loader.getHarness(MatButtonHarness.with({ text: 'Add' }));
    await addButton.click();

    expect(spectator.inject(SlideIn).open).toHaveBeenCalledWith(
      CloudSyncWizardComponent,
      { wide: true },
    );
  });

  it('shows confirmation dialog when Run Now button is pressed', async () => {
    jest.spyOn(spectator.inject(DialogService), 'confirm');
    const [menu] = await loader.getAllHarnesses(MatMenuHarness.with({ selector: '[mat-icon-button]' }));
    await menu.open();
    await menu.clickItem({ text: 'Run job' });

    expect(spectator.inject(DialogService).confirm).toHaveBeenCalledWith({
      title: 'Run Now',
      message: 'Run «custom-cloudsync» Cloud Sync now?',
      hideCheckbox: true,
    });

    expect(spectator.inject(ApiService).job).toHaveBeenCalledWith('cloudsync.sync', [3]);
  });

  it('shows confirmation dialog when Dry Run button is pressed', async () => {
    const [menu] = await loader.getAllHarnesses(MatMenuHarness.with({ selector: '[mat-icon-button]' }));
    await menu.open();
    await menu.clickItem({ text: 'Dry Run' });

    expect(spectator.inject(DialogService).confirm).toHaveBeenCalledWith({
      title: 'Test Cloud Sync',
      message: 'Start a dry run test of this cloud sync task? The  system will connect to the cloud service provider and simulate  transferring a file. No data will be sent or received.',
      hideCheckbox: true,
    });

    expect(spectator.inject(ApiService).job).toHaveBeenCalledWith('cloudsync.sync', [3, { dry_run: true }]);
  });

  it('shows dialog when Restore button is pressed', async () => {
    jest.spyOn(spectator.inject(MatDialog), 'open');
    const [menu] = await loader.getAllHarnesses(MatMenuHarness.with({ selector: '[mat-icon-button]' }));
    await menu.open();
    await menu.clickItem({ text: 'Restore' });

    expect(spectator.inject(MatDialog).open).toHaveBeenCalledWith(CloudSyncRestoreDialog, {
      data: 3,
    });
    expect(spectator.inject(SnackbarService).success).toHaveBeenCalledWith('Cloud Sync «custom-cloudsync» has been restored.');
  });

  it('deletes a CloudSync Task with confirmation when Delete button is pressed', async () => {
    const [menu] = await loader.getAllHarnesses(MatMenuHarness.with({ selector: '[mat-icon-button]' }));
    await menu.open();
    await menu.clickItem({ text: 'Delete' });

    expect(spectator.inject(DialogService).confirm).toHaveBeenCalledWith({
      title: 'Confirmation',
      message: 'Delete Cloud Sync Task <b>"custom-cloudsync"</b>?',
      buttonColor: 'warn',
      buttonText: 'Delete',
    });

    expect(spectator.inject(ApiService).call).toHaveBeenCalledWith('cloudsync.delete', [3]);
  });

  it('updates CloudSync Task Enabled status once mat-toggle is updated', async () => {
    const toggle = await table.getHarnessInCell(MatSlideToggleHarness, 1, 4);

    expect(await toggle.isChecked()).toBe(false);

    await toggle.check();

    expect(spectator.inject(ApiService).call).toHaveBeenCalledWith(
      'cloudsync.update',
      [3, { enabled: true }],
    );
  });
});
